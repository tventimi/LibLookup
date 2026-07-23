var queryTerm = document.getElementById("queryTerm")
queryTerm.addEventListener("keydown", function(event) {    
    if(event.key === "Enter") {
        event.preventDefault()
        addTerm();
    }
});

queryTerm.addEventListener("input", function(event) {
    if(queryTerm.value.length > 0) {
        document.getElementById("addTermButton").disabled = false
    } else {
        document.getElementById("addTermButton").disabled = true
    }
    updateBatchMode()
});

document.getElementById("submit").addEventListener("click", function(event) {   
    if(document.getElementById("searchTerms").length == 0) {
        if(document.getElementById("queryTerm").value == "") {
            document.getElementById("resultCount").innerHTML = "Please enter a search term."
            event.preventDefault()
            return
        } else {
            addTerm()
        }
    }
})

document.getElementById("addTermButton").addEventListener("click", addTerm);
function addTerm() {
    var term = document.getElementById("queryTerm").value;
    if(term === "") {
        return;
    }
    var searchTerms = document.getElementById("searchTerms");
    var operator = document.getElementById("operator")
    var queryTerm = ""
    if(searchTerms.length > 0) {
      queryTerm += operator.value.toUpperCase();  
    }

    queryTerm += (queryTerm != "") ? " " : ""
    queryTerm += document.getElementById("index").value + " " +
        document.getElementById("relator").value + " " +
        "\"" + term.replaceAll("\"","\\\"") + "\""
    searchTerms.add(new Option(queryTerm));
    operator.disabled = false;
    document.getElementById("addTermButton").disabled = true;
    document.getElementById("deleteTermButton").disabled = false;
    document.getElementById("clearTermsButton").disabled = false;
    document.getElementById("queryTerm").value = "";
    updateQueryString()
}

document.getElementById("deleteTermButton").addEventListener("click", deleteTerm);
function deleteTerm() {
    var searchTerms = document.getElementById("searchTerms")
    if(searchTerms.selectedIndex === 0 && searchTerms.length > 1) {
        searchTerms.options[1].text = searchTerms.options[1].value.replace(/^[A-Z]* /,"")
    }
    if(searchTerms.selectedIndex !== -1) {
        searchTerms.remove(searchTerms.selectedIndex);
    }
    
    if(searchTerms.length === 0) {
        document.getElementById("operator").disabled = true;
        document.getElementById("deleteTermButton").disabled = true;
        document.getElementById("clearTermsButton").disabled = true;
    }
    updateQueryString()
    updateBatchMode()
}

document.getElementById("clearTermsButton").addEventListener("click", clearTerms);
function clearTerms() {
    document.getElementById("searchTerms").innerHTML = '';
    document.getElementById("deleteTermButton").disabled = true;
    document.getElementById("clearTermsButton").disabled = true;
    updateQueryString()
    updateBatchMode()
}

function updateQueryString() {
    var options = Array.from(document.getElementById("searchTerms").options)
    var queryString = options.map(option => option.value).join(" ")
    document.getElementById("queryString").value = queryString; 
}

function updateBatchMode() {
    const columnRegex = /\[\[[A-Z]+\]\]/
    const queryString = decodeURIComponent(document.getElementById("queryString").value)
    const isBatch = columnRegex.test(document.getElementById("queryTerm").value) || columnRegex.test(queryString)
    var batchFields = document.getElementsByClassName("batch")
    for(var i = 0; i < batchFields.length; i++) {
       batchFields[i].style.visibility = isBatch ? "visible" : "hidden" 
    }
}