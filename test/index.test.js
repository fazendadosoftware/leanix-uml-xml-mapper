const { readFileSync } = require('fs')
const { getDiagrams, getBookmarks, createBookmark, createGraph } = require('../src/index')
const { expect } = require('chai')

describe('The LeanIX UML-XML mapper', () => {
  beforeEach(() => {
  })

  afterEach(async () => {
  })

  it('map the PREEview xml file', async function () {
    this.timeout(120000)
    const xmlString = readFileSync('data/PREEvision.xml', 'utf8')
    const diagrams = await getDiagrams(xmlString)
    expect(diagrams).to.be.an('array')
  })

  it('should get all bookmarks from workspace', async function () {
    this.timeout(120000)
    const bookmarks = await getBookmarks()
    expect(bookmarks).to.be.an('array')
  })

  it('should create a visualizer bookmark', async function () {
    this.timeout(120000)
    const bookmark = await createBookmark()
    expect(bookmark).to.be.an('object')
  })

  it('should write a diagram and create it in the workspace', async function () {
    this.timeout(120000)
    const xml = await createGraph()
    const bookmark = await createBookmark(xml, { name: 'testbernhard' })
  })

  const getStyle = type => {
    let style
    switch (type) {
      case 'uml:Component':
      case 'Component':
        style = 'html=1;outlineConnect=0;whiteSpace=wrap;fillColor=#99ffff;shape=mxgraph.archimate3.application;appType=comp;archiType=square;'
        break
      case 'uml:Activity':
      case 'Activity':
        style = 'html=1;outlineConnect=0;whiteSpace=wrap;fillColor=#99ffff;shape=mxgraph.archimate3.application;appType=serv;archiType=rounded'
        break
      case 'uml:Class':
      case 'Class':
        style = 'html=1;outlineConnect=0;whiteSpace=wrap;fillColor=#99ffff;shape=mxgraph.archimate3.businessObject;overflow=fill'
        break
      case 'uml:Note':
        style = 'rounded=0;whiteSpace=wrap;html=1;'
        break
      case 'uml:Text':
        style = 'rounded=0;whiteSpace=wrap;html=1;strokeColor=none;align=left;'
        break
      case 'association':
        style = 'endArrow=open;endFill=1;endSize=12;html=1;'
        break
      case 'dependency':
        style = 'endArrow=open;endSize=12;dashed=1;html=1;'
        break
      default:
        console.log(`unknown type ${type}`)
        style = ''
    }
    return style
  }

  it('should map the PREEvision - Service Interaction diagram', async function () {
    this.timeout(120000)
    const xmlString = readFileSync('data/PREEvision.xml', 'utf8')
    const diagrams = await getDiagrams(xmlString)
    // const diagram = diagrams.find(({ name }) => name === 'PREEvision - Service Interaction')
    // const diagram = diagrams.find(({ name }) => name === 'PREEvision - Technology Layer')
    const diagram = diagrams.find(({ name }) => name === 'PREEvision - Assignment Application Component / Business Layer')
    expect(diagram).to.be.an('object')
    const { name: diagramName, elements = [] } = diagram
    let { vertexes, edges } = elements.reverse()
      .reduce((accumulator, element) => {
        if (!element.id) {
          console.log('ignoring', element)
          return accumulator
        }
        let { parentId = null, id, name, documentation, project = {}, type, geometry = [], links = null } = element
        if (['uml:Activity', 'uml:Component', 'uml:Class', 'uml:Comment', 'uml:Note', 'uml:Text', 'Activity', 'Class', 'Component'].indexOf(type) > -1) {
          if (typeof geometry === 'string') {
            const { Left: x0, Right: x1, Bottom: y1, Top: y0 } = geometry.replace(/;/g, ' ').trim().split(' ')
              .reduce((accumulator, vertex) => {
                const [coordinate, value] = vertex.split('=')
                accumulator[coordinate] = parseInt(value)
                return accumulator
              }, {})
            geometry = [x0, y0, x1 - x0, y1 - y0]

            if (links !== null) {
              const { associations = [], dependencies = [] } = links
              const edges = [
                ...associations.filter(({ end }) => end === id).map(link => ({ ...link, type: 'association', style: getStyle('association') })),
                ...dependencies.filter(({ end }) => end === id).map(link => ({ ...link, type: 'dependency', style: getStyle('dependency') }))
              ]
              accumulator.edges.push(...edges)
            }
          }
          const style = getStyle(type)

          switch (type) {
            case 'uml:Text':
              // eslint-disable-next-line
              const keys = ['name', 'author', 'version', 'created', 'modified']
              project.name = diagramName
              name = Object.entries(project)
                .filter(([key]) => keys.indexOf(key) > -1)
                .sort(([A], [B]) => {
                  const idxA = keys.indexOf(A)
                  const idxB = keys.indexOf(B)
                  return idxA > idxB ? 1 : idxA < idxB ? -1 : 0
                })
                .reduce((accumulator, [key, value]) => {
                  const line = `${(word => word[0].toUpperCase() + word.substring(1))(key)}:\t${value}\n`
                  accumulator += line
                  return accumulator
                }, '')
              break
            case 'uml:Note':
              name = documentation
              break
          }
          accumulator.vertexes.push([parentId, id, name, ...geometry, style])
        } else {
          console.log(`ignoring element ${id} of type ${type}`)
        }
        return accumulator
      }, { vertexes: [], edges: [] })

    // sort vertexes so that parents are created first
    vertexes = vertexes.sort(([_, id], [parentId]) => id === parentId ? -1 : 0)
    const xml = await createGraph(vertexes, edges)
    const bookmark = await createBookmark(xml, { name: diagramName })
    expect(bookmark).to.be.an('object')
  })
})
