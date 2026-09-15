import { tokenize } from './queryutils.js'

export class CustomQuery {
    queryString = ""
    isCatalogLink = false
    indexes = {}
    relators = {}

    constructor(queryString,config) {
        var queryTokens = tokenize(queryString)
        if(config.indexes) {
            config.indexes.forEach(entry => {
                if(Object.hasOwn(entry,"code") && Object.hasOwn(entry, "paramName")) {
                    this.indexes[entry.code] = entry.paramName
                }
            })
        }
        if(config.relators) {
            this.relators = config.relators
        }
        for(var i = 0; i < queryTokens.length; i += 4) {
            var index = queryTokens[i]
            var relator = queryTokens[i+1]
            var searchTerm = queryTokens[i+2]
            if(this.queryString != "") {
                this.queryString += " "
            }   
            if(!relator.includes('=')) {
                if(searchTerm.match(/^\".*\"$/)) {
                    searchTerm = searchTerm.replace(/^\"/,"").replace(/\"$/,"")
                }
            }      
            if(index == 'link') {       
                searchTerm = searchTerm.replaceAll("\"\"","\"")      
                searchTerm = searchTerm.replace(/^http[^\?]*\?/,'')
                searchTerm = searchTerm.replace(/${config.pageParam}=[^=]*/,'')
                searchTerm = searchTerm.replace(/${config.maxRecsParam}=[^=]*/,'')
                if(Object.hasOwn(config,"catalogLinkParams")) {
                    searchTerm += "&" + config.catalogLinkParams
                }
                this.queryString = searchTerm
                this.isCatalogLink = true
                return
            }
            if(index == "raw") {                
                searchTerm = searchTerm.replaceAll("\"\"","\"")
            }
            const mappedRelator = Object.hasOwn(this.relators,relator) ? this.relators[relator] : this.relators['default'] 

            if(Object.hasOwn(this.indexes,index)) {
                this.queryString += this.indexes[index] + mappedRelator + searchTerm
            } else {
                this.queryString += searchTerm 
            }
            if(i+3 < queryTokens.length) {
                this.queryString += " " + queryTokens[i+3]
            }
        }        
    }
}