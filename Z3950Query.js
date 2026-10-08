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

const relators = {
    '<': 1,
    '<=': 2,
    '>': 4,
    '>=': 5,
    "<>": 6
}

export class Z3950Query {
    type = null
    operator = null
    leftOperand = null
    rightOperand = null
    attributes = null
    term = null
    queryString = ""
    config = null

    constructor(query, config = null, isPQF = false) {
        this.config = config
        query = isPQF ? query : this.convertToPQF(query)
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
                    this.leftOperand = new Z3950Query(queryTokens.slice(i + 1).join(" "),config,true)
                    this.queryString += " " + this.leftOperand.queryString
                    var lengthSoFar = this.queryString.length+1
                    this.rightOperand =  new Z3950Query(query.substring(lengthSoFar),config,true)
                    
                    if(this.leftOperand.type != "empty" && this.rightOperand.type != "empty") { //neither term empty
                        this.queryString += " " + this.rightOperand.queryString                
                    } else if(this.leftOperand.type == "empty" && this.rightOperand.type == "empty") { //both terms empty
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
                }
            } else {
                this.type = "operand"
                if(!this.attributes) {
                    this.attributes = []
                }                    
                this.term = ""
                if(isAttribute) {
                    isAttribute = false
                    var m = /([0-9]+)=([0-9]+)/.exec(token)
                    if(m) {
                        this.attributes.push({type: parseInt(m[1]), value: parseInt(m[2])})
                    }
                } else {
                    if(this.attributes.filter(a => a.type === 1).length == 0) {
                        this.attributes.push({type: 1, value: 1016})
                    }
                    this.term = token.replace(/^"(.*)"$/, '$1')
                    if(this.term == "") {
                        this.type = "empty"
                        this.attributes = []
                        return
                    }
                    break
                }
            }
        }
    }

    convertToPQF(query, precedences = ["or","and","andnot"]) {
        const queryTokens = tokenize(query)

        if(queryTokens.length == 3) {
            const index = queryTokens[0]
            const relator = queryTokens[1]
            const searchTerm = queryTokens[2] 
            if(index == "raw") {
                return searchTerm.replace(/^"(.*)"$/,'$1').replaceAll("\"\"","\"")
            }
            var pqfString = ""
            var useAttribute = Object.hasOwn(indexes, index) ? indexes[index] : parseInt(index)
            useAttribute = (Number.isNaN(useAttribute) ? 1016 : useAttribute)

            if(index == "recno" && this.config?.details?.recnoIndex) {
                useAttribute = this.config.details.recnoIndex
            }
            pqfString = `@attr 1=${useAttribute} `            
            
            if(Object.hasOwn(relators,relator)) {
                pqfString += `@attr 2=${relators[relator]} `
            }
            if(relator == "=") {
                pqfString += "@attr 4=1 "
            } else if(this.config?.details?.defaultStructure) {
                pqfString += `@attr 4=${this.config.details.defaultStructure} `
            }    
            if(index == "recno" && this.config?.details?.recnoNumeric) {
                pqfString += searchTerm.replaceAll(/[^0-9]/g,"")
            } else {
                pqfString += searchTerm
            }
            return pqfString
        } else {
            var segments = []
            var currentSegment = "" 
            const currentOperator = (precedences.length > 0) ? precedences[0] : "" 
            for(var i = 0; i < queryTokens.length; i += 4) {   
                currentSegment += queryTokens.slice(i, i + 3).join(" ")             
                const operator = (queryTokens[i+3] ?? "").toLowerCase().replace(/^not$/,"andnot")
                if(operator == currentOperator || operator == "") {
                    if(precedences.length == 0) {
                        segments.push(currentSegment)
                    } else {
                        segments.push(this.convertToPQF(currentSegment, precedences.slice(1)))
                    }
                    currentSegment = ""
                } else {
                    currentSegment += ` ${operator} `
               }
            }
            var pqfString = ""
            for(var i = 0; i < segments.length; i++) {
                const segment = segments[i]
                if(pqfString != "") {
                    pqfString = `@${currentOperator.toLowerCase()} ${pqfString} ${segment}`
                } else {
                    pqfString = segment
                }
            }
            return pqfString
        }
    }
}