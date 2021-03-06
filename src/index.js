const { Parser } = require('xml2js')
const { readFileSync, writeFileSync } = require('fs')
const { parseStringPromise } = new Parser()

// this example reads the file synchronously
// you can read it asynchronously also
const xmlString = readFileSync('data/PREEvision.xml', 'utf8')

const getDiagrams = async xml => {
  const document = await parseStringPromise(xml)
  let {
    'xmi:XMI': {
      'xmi:Extension': [
        {
          connectors: [{ connector: connectors = [] } = {}],
          diagrams: [{ diagram: diagrams = [] } = {}],
          elements: [{ element: elements = [] } = {}],
          primitivetypes,
          profiles
        } = {}
      ] = []
    }
  } = document
  diagrams = diagrams
    .map(diagram => {
      let {
        elements: [{ element: elements = [] } = {}],
        properties: [{ $: properties }],
        project: [{ $: project }]
      } = diagram
      elements = elements.map(({ $ }) => $)
      return { ...properties, ...project, elements }
    })
  const elementIndex = elements
    .reduce((accumulator, element) => {
      let {
        $: { name = null, scope, 'xmi:idref': id, 'xmi:type': type },
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
      element = { id, type, name, scope, links }
      accumulator[id] = element
      return accumulator
    }, {})
  diagrams = diagrams
    .map(diagram => {
      let { elements = [] } = diagram
      elements = elements.map(element => {
        const { subject } = element
        const { [subject]: e } = elementIndex
        delete element.subject
        return { ...element, ...e }
      })
      return { ...diagram, elements }
    })
  writeFileSync('data/diagrams.json', JSON.stringify(diagrams, null, 2))
  writeFileSync('data/elements.json', JSON.stringify(Object.values(elementIndex), null, 2))
  return { diagrams, elementIndex }
}
getDiagrams(xmlString)
