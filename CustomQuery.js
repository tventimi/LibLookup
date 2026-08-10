import { tokenize } from './queryutils.js'

export class CustomQuery {
    queryString = ""
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
            if(index == "raw") {
                searchTerm = searchTerm.replace(/^\"/,'').replace(/\"$/,'')
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