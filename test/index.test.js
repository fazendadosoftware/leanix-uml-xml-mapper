const { readFileSync } = require('fs')
const { getDiagrams, getBookmarks, createBookmark, createGraph, sortElements } = require('../src/index')
const { expect } = require('chai')

describe('The LeanIX UML-XML mapper', () => {
  beforeEach(() => {
  })

  afterEach(async () => {
  })

  it('should correctly sort element tree', async function () {
    const elements = [
      { id: 1, parentId: 2 },
      { id: 2, parentId: null },
      { id: 3, parentId: 1 },
      { id: 4, parentId: 5 },
      { id: 5, parentId: 1 },
      { id: 6, parentId: 2 },
      { id: 7, parentId: null }
    ]
    const sortedElements = elements.sort(sortElements)
    expect(sortedElements).to.be.an('array')
    expect(sortedElements.map(({ id }) => id)).to.be.deep.equal([2, 7, 1, 3, 5, 4, 6])
  })

  it('should get all bookmarks from workspace', async function () {
    this.timeout(120000)
    const bookmarks = await getBookmarks()
    expect(bookmarks).to.be.an('array')
  })

  it('should map the PREEvision - Service Interaction diagrams into LeanIX VISUALIZER bookmarks', async function () {
    this.timeout(120000)
    const xmlString = readFileSync('data/PREEvision.xml', 'utf8')
    const diagrams = await getDiagrams(xmlString)
    expect(diagrams).to.be.an('array')
    for (const diagram of diagrams) {
      console.log(`Creating ${diagram.name}`)
      expect(diagram).to.be.an('object')
      expect(diagram).to.contain.keys('elements', 'connectors', 'name')
      expect(diagram.elements).to.be.an('array')
      expect(diagram.connectors).to.be.an('array')
      const xml = await createGraph(diagram)
      const bookmark = await createBookmark(xml, { name: diagram.name })
      expect(bookmark).to.be.an('object')
    }
  })
})
