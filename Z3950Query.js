import { tokenize } from './queryutils.js'

const operators = {
    'and': 0, 
    'or': 1, 
    'andnot': 2
}

const indexes = {
    'keyword': 1016,
    'title': 4,
    'author': 1,
    'subject': 21,
    'isbn': 7,
    'issn': 8,
    'date': 31,
    'lang': 54,
    'recno': 12
}

export class Z3950Query {
    type = null
    operator = null
    leftOperand = null
    rightOperand = null
    attributes = null
    term = null
    queryString = ""

    constructor(query, details = null, isRaw = false) {
        var queryTokens = tokenize(query)      
        if(isRaw){
            this.rawZ3950toQuery(query,details)
            return
        }
        for(var i = 0; i < queryTokens.length; i += 4) {
            var index = queryTokens[i]
            var relator = queryTokens[i+1]
            var searchTerm = queryTokens[i+2]

            if(i+3 < queryTokens.length) {
                this.type = "operator"
                var operator = queryTokens.at(-4).toLowerCase().replace("not","andnot")
                this.operator = operators[operator]
                this.leftOperand = new Z3950Query(queryTokens.slice(0,-4).join(" "),details)
                this.rightOperand =  new Z3950Query(queryTokens.slice(-3).join(" "),details)
                if(this.leftOperand.type != "empty" && this.rightOperand.type != "empty") {
                    this.queryString = this.leftOperand.queryString + " " + queryTokens[i+3] + " " + this.rightOperand.queryString
                } else if(this.leftOperand.type == "empty" && this.rightOperand.type == "empty") {
                    this.type = "operand"
                    this.term = ""
                    this.leftOperand = null
                    this.rightOperand = null  
                    this.attributes = []
                    this.queryString = ""
                } else { //one empty term
                    var singleOperand = (this.leftOperand.type != "empty") ? this.leftOperand : this.rightOperand
                    this.type = singleOperand.type
                    this.queryString = singleOperand.queryString
                    if(this.type == 'operand') {
                        this.attributes = singleOperand.attributes
                        this.term = singleOperand.term  
                        this.leftOperand = null
                        this.rightOperand = null                  
                    } else {
                        this.operator = singleOperand.operator
                        this.leftOperand = singleOperand.leftOperand
                        this.rightOperand = singleOperand.rightOperand
                    }
                }
                return
            } else {
                searchTerm = searchTerm.replace(/^\"/, '').replace(/\"$/, '').replaceAll("\"\"","\"")                
                if(searchTerm == "") {
                    this.type = "empty"
                    this.attributes = []
                    return
                }
                this.type = "operand"
                if(index == "raw") {
                    var zQuery = new Z3950Query(searchTerm,details,true)
                    this.type = zQuery.type
                    this.queryString = zQuery.queryString
                    if(zQuery.type == 'operand') {
                        this.attributes = zQuery.attributes
                        this.term = zQuery.term                    
                    } else {
                        this.operator = zQuery.operator
                        this.leftOperand = zQuery.leftOperand
                        this.rightOperand = zQuery.rightOperand
                    }
                } else {
                    var useAttribute = indexes[index]
                    if(index == "recno" && details?.recnoIndex) {
                        useAttribute = details.recnoIndex
                    }
                    this.attributes = [{type: 1, value: useAttribute}]
                    if(relator == "=") {
                        this.attributes.push({type: 4, value: 1})
                    } else if(details?.defaultStructure) {
                        this.attributes.push({type: 4, value: details.defaultStructure})
                    }
                    this.term = searchTerm
                    if(index == "recno" && details?.recnoNumeric) {
                        this.term = this.term.replaceAll(/[^0-9]/g,"")
                    }
                    this.queryString = queryTokens.slice(0,3).join(" ")
                }
                break
            }
        }              
    }

    rawZ3950toQuery(query,details) {
        var queryTokens = tokenize(query)
        var isAttribute = false
        for(var i = 0; i < queryTokens.length; i++) {
            var token = queryTokens[i]
            this.queryString += (this.queryString != "" ? " " : "") + token
            if(token.startsWith('@')) {
                if(token == '@attr') {
                    isAttribute = true
                    this.type = "operand"
                } else {
                    this.type = "operator"
                    this.operator = operators[token.substring(1).toLowerCase().replace(/^not$/,"andnot")]
                    this.leftOperand = new Z3950Query(queryTokens.slice(i + 1).join(" "),details,true)
                    this.queryString += " " + this.leftOperand.queryString
                    var lengthSoFar = this.queryString.length
                    this.rightOperand =  new Z3950Query(query.substring(lengthSoFar),details,true)
                    this.queryString += " " + this.rightOperand.queryString
                    return
                }
            } else {
                if(!this.type) {
                    this.type = "operand"
                }
                if(!this.attributes) {
                    this.attributes = []
                }                    
                if(!this.term) {
                    this.term = ""
                }
                if(isAttribute) {
                    isAttribute = false
                    var m = /([0-9]+)=([0-9]+)/.exec(token)
                    if(m) {
                        this.attributes.push({type: parseInt(m[1]), value: parseInt(m[2])})
                    }
                } else {
                    if(this.attributes.length == 0) {
                        this.attributes.push({type: 1, value: 1016})
                    }
                    this.term = token.replace(/^\"/, '').replace(/\"$/, '')
                    break
                }
            }
        }
    }
}