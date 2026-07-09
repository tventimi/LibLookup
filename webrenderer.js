const urlParams = new URLSearchParams(window.location.search)
var catalog = ""
var query = ""
var displayFields = ""

urlParams.forEach((value, key) => {
    if(key === "catalog") {
        document.getElementById("catalog").value = value
        catalog = value
    } else if(key === "q") {
        document.getElementById("queryString").value = value
        var searchTerms = document.getElementById("searchTerms")
        var queryString = decodeURIComponent(value)
        var queryTokens = tokenize(queryString)
        for(var i = 0; i < queryTokens.length; i += 3) {
            if(i == 0) {
                searchTerms.add(new Option(queryTokens.slice(i,i+3).join(' ')))
            } else {
                searchTerms.add(new Option(queryTokens.slice(i,i+4).join(' ')))
                i++
            }
        }
    } else if(key === "displayFields") {
        document.getElementById("displayFields").value = value
        displayFields = value
    } 
})

if(catalog && query) {
    document.title = "LibLookup: " + catalog + " " + query
}     

function tokenize(str) {
    const regex = /"[^"]+"|[^\s]+/g;
    let matches = [];
    let match;
    while ((match = regex.exec(str)) !== null) {
        matches.push(match[0]);
    }
    return matches;
}




