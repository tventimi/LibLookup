import { tokenize } from './queryutils.js'

export class CustomQuery {
    queryString = ""
    isCatalogLink = false
    indexes = {}
    relators = {}

    constructor(queryString,config) {
        var queryTokens = tokenize(queryString)
        config?.indexes?.forEach(entry => {
            if(Object.hasOwn(entry,"code") && Object.hasOwn(entry, "paramName")) {
                this.indexes[entry.code] = entry.paramName
            }
        })

        this.relators = config?.relators

        for(var i = 0; i < queryTokens.length; i += 4) {
            var index = queryTokens[i]
            var relator = queryTokens[i+1]
            var searchTerm = queryTokens[i+2]
            if(this.queryString != "") {
                this.queryString += " "
            }   
                
            if(index == 'link') {       
                searchTerm = searchTerm.replace(/^"(.*)"$/,"$1")
                searchTerm = searchTerm.replaceAll("\"\"","\"")      
                searchTerm = searchTerm.replace(/^http[^?]*\?/,'')
                searchTerm = searchTerm.replace(new RegExp(`&${config.pageParam}=[^&]*`),'')
                searchTerm = searchTerm.replace(new RegExp(`&${config.maxRecsParam}=[^&]*`),'')
                if(Object.hasOwn(config,"catalogLinkParams")) {
                    searchTerm += config?.catalogLinkParams
                }
                this.queryString = searchTerm
                this.isCatalogLink = true
                return
            }
            else if(index == "raw") {     
                searchTerm = searchTerm.replace(/^"(.*)"$/,"$1")          
                searchTerm = searchTerm.replaceAll("\"\"","\"")
            }
            else if(!relator.includes('=')) {
                searchTerm = searchTerm.replace(/^"(.*)"$/,"$1")    
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