const { JSDOM } = require('jsdom')
const { Parser } = require('xml2js')
const { Authenticator } = require('leanix-js')
const fetch = require('node-fetch')
const { instance, apiToken } = require('../lxr.json')
const { parseStringPromise } = new Parser()

const dom = new JSDOM()
global.window = dom.window
global.document = window.document
global.XMLSerializer = window.XMLSerializer
global.navigator = window.navigator
const { mxGraph: MXGraph, mxCodec: MXCodec, mxUtils: { getXml } } = require('mxgraph')()

const createGraph = async (vertexes = [], edges = []) => {
  const graph = new MXGraph()
  const vertexIndex = {}
  graph.getModel().beginUpdate()
  try {
    JSON.parse(JSON.stringify(vertexes)).forEach(vertex => {
      const parentId = vertex.shift()
      const [id] = vertex
      const { [parentId]: parent = graph.getDefaultParent() } = vertexIndex
      const v = graph.insertVertex(parent, ...vertex)
      vertexIndex[id] = v
    })
    edges.forEach(edge => {
      const { id, type, start, end, style } = edge
      const source = vertexIndex[start]
      const target = vertexIndex[end]
      if (source && target) {
        graph.insertEdge(graph.getDefaultParent(), id, '', source, target, style)
      }
    })
  } finally {
    // Updates the display
    graph.getModel().endUpdate()
  }
  const encoder = new MXCodec()
  const xml = getXml(encoder.encode(graph.getModel()))
  return xml
}

// this example reads the file synchronously
// you can read it asynchronously also
// const xmlString = readFileSync('data/PREEvision.xml', 'utf8')

const getBookmarks = async () => {
  const authenticator = new Authenticator(instance, apiToken)
  await authenticator.start()
  const { accessToken } = authenticator
  const url = `https://${instance}/services/pathfinder/v1/bookmarks?bookmarkType=VISUALIZER`
  try {
    const response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` } })
    const { ok, status } = response
    if (ok) {
      const { data: bookmarks } = await response.json()
      return bookmarks
    }
    throw Error(`${status} while fetching bookmarks`)
  } finally {
    await authenticator.stop()
  }
}

const createBookmark = async (graphXml = null, { name = 'diagram', description = '' } = {}) => {
  if (graphXml === null) throw Error('invalid xml')
  const authenticator = new Authenticator(instance, apiToken)
  await authenticator.start()
  const { accessToken } = authenticator
  const url = `https://${instance}/services/pathfinder/v1/bookmarks`
  const bookmark = { groupKey: 'freedraw', description, name, type: 'VISUALIZER', state: { graphXml } }
  try {
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(bookmark),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })
    const { ok, status } = response
    if (ok) {
      const { data: bookmark } = await response.json()
      return bookmark
    }
    throw Error(`${status} while creating bookmark`)
  } finally {
    await authenticator.stop()
  }
}

const getParentIndex = document => {
  // const blacklistTypes = ['uml:Association', 'uml:Dependency', 'uml:Class', 'uml:Package']
  const { 'xmi:XMI': { 'uml:Model': [rootElement] } } = document

  const unrollPackagedElements = (element = {}, parentId = null, index = {}) => {
    const { $: { 'xmi:id': id = null } = {}, packagedElement: packagedElements = [] } = element
    if (parentId !== null && id !== null) index[id] = parentId
    index = packagedElements.reduce((accumulator, element) => ({ ...accumulator, ...unrollPackagedElements(element, id, index) }), index)
    return index
  }

  const parentIndex = unrollPackagedElements(rootElement)
  return parentIndex
}

const getDiagrams = async xml => {
  const document = await parseStringPromise(xml)
  let {
    'xmi:XMI': {
      'xmi:Extension': [
        {
          diagrams: [{ diagram: diagrams = [] } = {}],
          elements: [{ element: elements = [] } = {}],
          connectors: [{ connector: connectors = [] } = {}]
        } = {}
      ] = []
    }
  } = document

  const connectorElementIndex = connectors
    .reduce((accumulator, { source: [source], target: [target] }) => {
      [source, target]
        .forEach(({ $: { 'xmi:idref': id }, model: [{ $: { type, name }}] }) => {
          accumulator[id] = { id, type, name }
        })
      return accumulator
    }, {})

  const { connectorIndex, elementIndex } = connectors
    .reduce((accumulator, connector) => {
      let { $: { 'xmi:idref': id }, extendedProperties: [{ $: { conditional: type = '' } }], source: [source], target: [target] } = connector
      const { $: { 'xmi:idref': sourceId = null } } = source
      const { $: { 'xmi:idref': targetId = null } } = target
      type = type.replace(/[^\w\s]/gi, '').replace(/\r?\n|\r/g, '')
      accumulator.connectorIndex[id] = { id, sourceId, targetId, type }
      for (const element of [source, target]) {
        const { $: { 'xmi:idref': id }, model: [{ $: { type, name } }] } = element
        accumulator.elementIndex[id] = { id, type, name }
      }
      return accumulator
    }, { connectorIndex: {}, elementIndex: {} })

  // const parentIndex = getParentIndex(document)

  diagrams = diagrams
    .map(diagram => {
      let {
        elements: [{ element: elements = [] } = {}],
        properties: [{ $: properties }],
        project: [{ $: project }]
      } = diagram
      let connectors
      ({ elements = [], connectors = [] } = elements
        .map(({ $ }) => $)
        .reduce((accumulator, element) => {
          const { subject = null, geometry = null } = element
          if (typeof geometry === 'string') {
            const { Left: x0, Right: x1, Bottom: y1, Top: y0 } = geometry.replace(/;/g, ' ').trim().split(' ')
              .reduce((accumulator, vertex) => {
                const [coordinate, value] = vertex.split('=')
                accumulator[coordinate] = parseInt(value)
                return accumulator
              }, {})
            element.geometry = [x0, y0, x1 - x0, y1 - y0]
          }
          if (subject in elementIndex) accumulator.elements.push({ ...elementIndex[subject], ...element })
          else if (subject in connectorIndex) accumulator.connectors.push({ ...connectorIndex[subject], ...element })
          return accumulator
        }, { elements: [], connectors: [] }))
      return { ...properties, ...project, elements, connectors }
    })
  /*
  const elementIndex = elements
    .reduce((accumulator, element) => {
      let {
        $: { name = null, 'xmi:idref': id, 'xmi:type': type },
        properties: [{ $: { documentation = null } = {} }] = [{}],
        project: [{ $: project = {} }] = [{}],
        links = null
      } = element
      if (Array.isArray(links)) {
        let { Dependency: dependencies = [], Association: associations = [] } = links[0]
        associations = associations
          .map(({ $: { 'xmi:id': id, end, start } }) => ({ id, end, start }))
        dependencies = dependencies
          .map(({ $: { 'xmi:id': id, end, start } }) => ({ id, end, start }))
        links = { dependencies, associations }
      }
      const { [id]: parentId = null } = parentIndex
      element = { id, parentId, type, name, links, documentation, project }
      accumulator[id] = element
      return accumulator
    }, {})
  */
  return diagrams
}

module.exports = {
  getDiagrams,
  getBookmarks,
  createBookmark,

  createGraph
}
