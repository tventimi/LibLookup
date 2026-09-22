import { tokenize } from './queryutils.js'

var indexes = {
    "keyword": "alma.all_for_ui",
    "recno": "rec.id",
    "title": "alma.title",
    "author": "alma.name",
    "subject": "alma.subjects",
    "isbn": "alma.isbn",
    "issn": "alma.issn",
    "lang": "alma.language",
    "date": "alma.main_pub_date"
}

export class SRUQuery {
    queryString = ""
    barcode = null

    constructor(queryString) {
        var queryTokens = tokenize(queryString)
        for(var i = 0; i < queryTokens.length; i += 4) {
            var index = queryTokens[i]
            var relator = queryTokens[i+1]
            var searchTerm = queryTokens[i+2]

            if(index.includes('barcode')) {
                this.barcode = searchTerm.replace(/^"/,"").replace(/"$/,"")
            }

            if(relator == "empty") {
                relator = "="
                searchTerm = "\"\""
            }

            if(this.queryString != "") {
                this.queryString += " "
            }
            if(index == "raw") {
                searchTerm = searchTerm.replace(/^"(.*)"$/,"$1")
                searchTerm = searchTerm.replaceAll('""','"')                
                this.queryString += "(" + searchTerm + " )"
            } else {
                const mappedIndex = Object.hasOwn(indexes,index) ? indexes[index] : index
                this.queryString += mappedIndex + " " + relator + " " + searchTerm
            }
            if(i+3 < queryTokens.length) {
                this.queryString += " " + queryTokens[i+3]
            }
        }
    }
}