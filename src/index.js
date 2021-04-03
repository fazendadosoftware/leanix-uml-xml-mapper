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

const sortElements = (elementA = {}, elementB = {}) => {
  if ((elementA.id === elementB.parentId) || (elementA.parentId === null && elementB.parentId !== null)) return -1
  else if ((elementA.parentId === elementB.id) || (elementB.parentId === null && elementA.parentId !== null)) return 1
  else return 0
}

const getParentIndex = document => {
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

  const parentIndex = getParentIndex(document)

  const elementStereotypeIndex = elements
    .reduce((accumulator, element) => {
      const { $: { 'xmi:idref': id }, properties: [{ $: { stereotype = null, documentation = null } }] } = element
      accumulator[id] = { stereotype, documentation }
      return accumulator
    }, {})

  const { connectorIndex, elementIndex } = connectors
    .reduce((accumulator, connector) => {
      let { $: { 'xmi:idref': id }, extendedProperties: [{ $: { conditional: type = '' } }], source: [source], target: [target] } = connector
      const { $: { 'xmi:idref': sourceId = null } } = source
      const { $: { 'xmi:idref': targetId = null } } = target
      type = type.replace(/[^\w\s]/gi, '').replace(/\r?\n|\r/g, '').trim()
      accumulator.connectorIndex[id] = { id, sourceId, targetId, type }
      for (const element of [source, target]) {
        const { $: { 'xmi:idref': id }, model: [{ $: { type, name } }] } = element
        const { [id]: { stereotype, documentation } = {} } = elementStereotypeIndex
        const parentId = parentIndex[id] || null
        accumulator.elementIndex[id] = { id, parentId, type: stereotype || type, name: name || documentation }
      }
      return accumulator
    }, { connectorIndex: {}, elementIndex: {} })

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
          if (typeof geometry === 'string' && geometry) {
            const { Left: x0 = null, Right: x1 = null, Bottom: y1 = null, Top: y0 = null } = geometry.replace(/;/g, ' ').trim().split(' ')
              .reduce((accumulator, vertex) => {
                const [coordinate, value] = vertex.split('=')
                accumulator[coordinate] = parseInt(value)
                return accumulator
              }, {})
            if (x0 !== null) element.geometry = [x0, y0, x1 - x0, y1 - y0]
          }
          if (subject in elementIndex) accumulator.elements.push({ ...elementIndex[subject], ...element })
          else if (subject in connectorIndex) accumulator.connectors.push({ ...connectorIndex[subject], ...element })
          return accumulator
        }, { elements: [], connectors: [] }))
      elements = elements.sort(sortElements)
      return { ...properties, ...project, elements, connectors }
    })
  return diagrams
}

const styles = {
  ArchiMate_ApplicationComponent: 'html=1;outlineConnect=0;whiteSpace=wrap;fillColor=#99ffff;shape=mxgraph.archimate3.application;appType=comp;archiType=square;',
  ArchiMate_ApplicationFunction: 'html=1;outlineConnect=0;whiteSpace=wrap;fillColor=#99ffff;shape=mxgraph.archimate3.application;appType=func;archiType=rounded;',
  ArchiMate_ApplicationService: 'html=1;outlineConnect=0;whiteSpace=wrap;fillColor=#99ffff;shape=mxgraph.archimate3.application;appType=serv;archiType=rounded',
  ArchiMate_DataObject: 'html=1;outlineConnect=0;whiteSpace=wrap;fillColor=#99ffff;shape=mxgraph.archimate3.businessObject;overflow=fill',
  // used ArchiMate_TechnologyArtifact since ArchiMate_TechnologyObject is not in the mxgraph's shape catalog
  ArchiMate_TechnologyObject: 'html=1;outlineConnect=0;whiteSpace=wrap;fillColor=#AFFFAF;shape=mxgraph.archimate3.application;appType=artifact;archiType=square;',
  ArchiMate_TechnologyService: 'html=1;outlineConnect=0;whiteSpace=wrap;fillColor=#AFFFAF;shape=mxgraph.archimate3.application;appType=serv;archiType=rounded',
  ArchiMate_SystemSoftware: 'html=1;outlineConnect=0;whiteSpace=wrap;fillColor=#AFFFAF;shape=mxgraph.archimate3.tech;techType=sysSw;',
  Activity: 'html=1;outlineConnect=0;whiteSpace=wrap;fillColor=#ffff99;shape=mxgraph.archimate3.application;appType=func;archiType=rounded;',
  Class: 'html=1;outlineConnect=0;whiteSpace=wrap;fillColor=#ffff99;shape=mxgraph.archimate3.businessObject;overflow=fill;',
  Note: 'text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;rounded=0;',
  // Relations
  ArchiMate_Access: 'edgeStyle=elbowEdgeStyle;html=1;endArrow=open;elbow=vertical;endFill=0;dashed=1;dashPattern=1 4;',
  ArchiMate_Assignment: 'endArrow=block;html=1;endFill=1;startArrow=oval;startFill=1;edgeStyle=elbowEdgeStyle;elbow=vertical;',
  ArchiMate_Realization: 'edgeStyle=elbowEdgeStyle;html=1;endArrow=block;elbow=vertical;endFill=0;dashed=1;',
  ArchiMate_Serving: 'edgeStyle=elbowEdgeStyle;html=1;endArrow=open;elbow=vertical;endFill=1;',
}

const getStyle = type => {
  if (type && !styles[type]) console.warn(`No style defined for type ${type}`)
  const style = styles[type] || ''
  return style
}

const createGraph = async diagram => {
  const { elements = [], connectors = [] } = diagram
  const graph = new MXGraph()
  const vertexIndex = {}
  graph.getModel().beginUpdate()
  try {
    elements
      .forEach(element => {
        const { id, parentId, name, type, geometry } = element
        vertexIndex[id] = graph.insertVertex(vertexIndex[parentId] || graph.getDefaultParent(), id, name, ...geometry, getStyle(type))
      })
    connectors
      .forEach(connector => {
        const { id, type, sourceId, targetId } = connector
        const sourceVertex = vertexIndex[sourceId]
        const targetVertex = vertexIndex[targetId]
        graph.insertEdge(graph.getDefaultParent(), id, '', sourceVertex, targetVertex, getStyle(type))
      })
  } finally {
    graph.getModel().endUpdate()
  }
  const encoder = new MXCodec()
  const xml = getXml(encoder.encode(graph.getModel()))
  return xml
}

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

module.exports = {
  sortElements,
  getDiagrams,
  getBookmarks,
  createBookmark,
  createGraph
}
