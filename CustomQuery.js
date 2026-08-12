import { tokenize } from './queryutils.js'

export class CustomQuery {
    queryString = ""
    isCatalogLink = false
    indexes = {}
    relators = {}

    constructor(queryString,config) {
        var queryTokens = tokenize(queryString)
        if(config.indexes) {
            this.indexes = config.indexes
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
            if(index == 'link') {
                if(searchTerm.match(/^\".*\"$/)) {
                    searchTerm = searchTerm.replace(/^\"/,"").replace(/\"$/,"")
                }
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
                if(searchTerm.match(/^\".*\"$/)) {
                    searchTerm = searchTerm.replace(/^\"/,'').replace(/\"$/,'')
                }
                searchTerm = searchTerm.replaceAll("\"\"","\"")
            }
            if(Object.hasOwn(this.indexes,index) && Object.hasOwn(this.relators,relator)) {
                this.queryString += this.indexes[index] + this.relators[relator] + searchTerm
            } else {
                this.queryString += searchTerm 
            }
            if(i+3 < queryTokens.length) {
                this.queryString += " " + queryTokens[i+3]
            }
        }        
    }
}