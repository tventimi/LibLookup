import { tokenize } from './queryutils.js'

var indexes = {
    "keyword": "alma.all_for_ui",
    "recno": "rec.id",
    "title": "alma.title",
    "author": "alma.name",
    "subject": "alma.subjects",
    "isbn": "alma.isbn",
    "issn": "alma.issn",
    "date": "alma.date_of_publication"
}

var relators = {
    '=': "all",
    '==': "="
}

export class SRUQuery {
    queryString = ""

    constructor(queryString) {
        var queryTokens = tokenize(queryString)
        for(var i = 0; i < queryTokens.length; i += 4) {
            var index = queryTokens[i]
            var relator = queryTokens[i+1]
            var searchTerm = queryTokens[i+2]
            if(queryString != "") {
                this.queryString += " "
            }
            if(index == "raw") {
                searchTerm = searchTerm.replace(/^\"/,'').replace(/\"$/,'')
                this.queryString += "(" + searchTerm + " )"
            } else {
                this.queryString += "(" + indexes[index] + " " + relators[relator] + " " + searchTerm + " )" 
            }
            if(i+3 < queryTokens.length) {
                this.queryString += " " + queryTokens[i+3]
            }
        }
    }
}