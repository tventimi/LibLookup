const operators = {'and': 0, 'or': 1, 'andnot': 2}

export class Z3950Query {
    type = null
    operator = null
    leftOperand = null
    rightOperand = null
    attributes = null
    term = null
    queryString = ""
    constructor(query) {
        if(!query.includes('@')) {
            if(!(query.startsWith('"') && query.endsWith('"'))) {
                query = "\"" + query + "\""
            }
            query = "@attr 1=1016 " + query
        }
        var queryTokens = this.tokenize(query)
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
                    this.operator = operators[token.substring(1)]
                    this.leftOperand = new Z3950Query(queryTokens.slice(i + 1).join(" "))
                    this.queryString += " " + this.leftOperand.queryString
                    var lengthSoFar = this.queryString.length
                    this.rightOperand =  new Z3950Query(query.substring(lengthSoFar))
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
                    this.term = token.replace(/^\"/, '').replace(/\"$/, '')
                    break
                }
            }
        }  
    }

    // Simple tokenizer to split by whitespace but preserve quoted strings
    tokenize(str) {
        const regex = /@\w+|@attr \d+=\d+|"[^"]+"|[^\s]+/g;
        let matches = [];
        let match;
        while ((match = regex.exec(str)) !== null) {
            matches.push(match[0]);
        }
        return matches;
    }
}