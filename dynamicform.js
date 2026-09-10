var catalogSelect = null
var indexMenu = null
var relatorMenu = null
var queryTerm = null
var secondaryIndex = ""

var menuMap = {}

init();

function init() {
    catalogSelect = document.getElementById("catalog")
    catalogSelect.addEventListener("change", function(event) {
        updateMenus(event.target.value)
    })

    indexMenu = document.getElementById('index')
    indexMenu.addEventListener("change", function(event) {
        var catalogCode = catalogSelect.value
        if(Object.hasOwn(menuMap,catalogCode)) {
            if(event.target.value == "SECONDARY_INDEX") {
                document.getElementById("secondaryIndexDialog").showModal()
                document.getElementById("secondaryIndexFilter").dispatchEvent(new Event("input"))
                return
            }
            var menuContents = menuMap[catalogCode].primary
            var indexEntry = menuContents.filter(index => index.code == event.target.value)
            if(indexEntry.length > 0) {
                var relators = ['=']
                if(Object.hasOwn(indexEntry[0],'relators')) {
                    relators = indexEntry[0].relators
                } 
                updateRelatorMenu(relators)
            }
        }
    })    

    var catalogCode = catalogSelect.value
    menuMap = JSON.parse(document.getElementById("menumap").textContent)
    relatorMenu = document.getElementById('relator')
    queryTerm = document.getElementById("queryTerm")
    queryTerm.addEventListener("keydown", function(event) {    
        if(event.key === "Enter") {
            event.preventDefault()
            addTerm();
        }
    });

    relatorMenu.addEventListener("change", function(event) {
        if(event.target.value == "empty") {
            queryTerm.value = "[empty]"
            document.getElementById("addTermButton").disabled = false
        } 
    })
    queryTerm.addEventListener("input", function(event) {
        if(queryTerm.value.length > 0 && !document.getElementById("queryString").value.startsWith("link")) {
            document.getElementById("addTermButton").disabled = false
        } else {
            document.getElementById("addTermButton").disabled = true
        }
        updateBatchMode()
    });
    const filter = document.getElementById("secondaryIndexFilter")
    filter.addEventListener('input',function(event) {        
        catalogCode = catalogSelect.value
        const normInput = event.target.value.toLowerCase()
        const filteredList = menuMap[catalogCode].secondary.filter(index => 
            (index.code + "|" + index.name).toLowerCase().includes(normInput) 
        )
        secondaryIndexList.innerHTML = ""
        for(var j = 0; j < filteredList.length; j++) {
            sindex = filteredList[j]
            secondaryIndexList.append(new Option(`${sindex.name} (${sindex.code})`,sindex.code))
        }
    })
    filter.addEventListener('keydown',function(event) {
        if(event.key === "Enter") {
            event.preventDefault()
            document.getElementById("submitSecondaryIndexDialog").click()
        }
    })

    document.getElementById("secondaryIndexList").addEventListener('dblclick',function() {
        document.getElementById("submitSecondaryIndexDialog").click()
    })


    document.getElementById("submitSecondaryIndexDialog").addEventListener('click',function() {
        const slist = document.getElementById("secondaryIndexList")
        const selectedCode = slist.value
        indexMenu.insertBefore(new Option(slist[slist.selectedIndex].text,selectedCode),
            indexMenu.lastElementChild)
        indexMenu.selectedIndex = indexMenu.length - 2
        var relators = ['=']
        catalogCode = catalogSelect.value
        var indexEntry = menuMap[catalogCode].secondary.filter(index => index.code == selectedCode)
        if(indexEntry.length > 0) {            
            if(Object.hasOwn(indexEntry[0],'relators')) {
                relators = indexEntry[0].relators
            }   
        }
        updateRelatorMenu(relators)
        document.getElementById("secondaryIndexDialog").close()
    })
    document.getElementById("closeSecondaryIndexDialog").addEventListener('click',function() {
        document.getElementById("secondaryIndexDialog").close()
        indexMenu.selectedIndex = 0
        secondaryIndex = ""
    })

    const resultField = document.getElementById("resultField")
    resultField.addEventListener("change",function(event) {
        setCustomResult(event.target.value)
    })
    updateMenus(catalogCode)
    updateQueryString()
}

document.getElementById("customResultField").addEventListener("keydown",function(event) {    
    if(event.key === "Enter") {
        event.preventDefault()
        addResult();
    }
})

function setCustomResult(resultCode) {
    var catalogCode = catalogSelect.value
    const literalCode = menuMap[catalogCode].resultFields.filter(res => res.code == resultCode)
    if(literalCode.length == 0) {
        document.getElementById("resultField").value = "other"
        document.getElementById("customResultField").value = resultCode
    } else {
        document.getElementById("customResultField").value = literalCode[0].value
    }    
    toggleCustomResult()
}

function updateMenus(catalogCode) {
    if(Object.hasOwn(menuMap,catalogCode)) {
        indexMenu.innerHTML = ""
        var menuContents = menuMap[catalogCode].primary
        for(var i = 0; i < menuContents.length; i++) {
            indexMenu.append(new Option(menuContents[i].name,menuContents[i].code))
        }
        document.getElementById("secondaryIndexFilter").innerHTML = ""
        if(Object.hasOwn(menuMap[catalogCode],'secondary')) {
            indexMenu.append(new Option("More...","SECONDARY_INDEX"))
            var secondaryIndexList = document.getElementById("secondaryIndexList")
            secondaryIndexList.innerHTML = ""
            menuMap[catalogCode].secondary.sort((a,b) => a.name.localeCompare(b.name))
            for(var j = 0; j < menuMap[catalogCode].secondary.length; j++) {
                sindex = menuMap[catalogCode].secondary[j]
                secondaryIndexList.append(new Option(`${sindex.name} (${sindex.code})`,sindex.code))
            }
        }
        var relators = ['=']
        if(Object.hasOwn(menuContents[0],'relators')) {
            relators = menuContents[0].relators
        } 
        updateRelatorMenu(relators)

        const resultFieldsMenu =  document.getElementById("resultField") 
        resultFieldsMenu.innerHTML = ""
        const resultContents = menuMap[catalogCode].resultFields 
        for(var i = 0; i < resultContents.length; i++) {
            resultFieldsMenu.appendChild(new Option(resultContents[i].name,resultContents[i].code))
        }
        setCustomResult(resultFieldsMenu[0].value)

    }
}

function updateRelatorMenu(relatorList) {
    relatorMenu.innerHTML = ""
    for(var i = 0; i < relatorList.length; i++) {
        relatorMenu.append(new Option(relatorList[i],relatorList[i]))
    }
}

document.getElementById("submit").addEventListener("click", function(event) {       
    document.getElementById("catalogLink").innerHTML = ""
    if(document.getElementById("searchTerms").length == 0) {
        if(document.getElementById("queryTerm").value == "") {
            document.getElementById("resultCount").innerHTML = "Please enter a search term."
            event.preventDefault()
            return
        } else {
            addTerm()            
        }
    }
    if(document.getElementById("resultFieldsList").length == 0) {
        addResult()
    }
})

document.getElementById("addTermButton").addEventListener("click", addTerm);
function addTerm() {
    var term = document.getElementById("queryTerm").value;
    const index = document.getElementById("index").value
    term = decodeURIComponent(term)
    if(term.match(/^\".*\"$/)) {
        term = term.replace(/^\"/,"").replace(/\"$/,"")
    }
    if(term === "") {
        return;
    }
    if(index == "link") {
        clearTerms()
    }

    var searchTerms = document.getElementById("searchTerms");
    var operator = document.getElementById("operator")
    var queryTerm = ""
    if(searchTerms.length > 0) {
      queryTerm += operator.value.toUpperCase();  
    }

    queryTerm += (queryTerm != "") ? " " : ""
    queryTerm += index + " " +
        document.getElementById("relator").value + " " +
        "\"" + term.replaceAll("\"","\"\"") + "\""
    searchTerms.add(new Option(queryTerm));
    searchTerms.scrollTop = searchTerms.scrollHeight

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
    var queryTerm = searchTerms.options[searchTerms.selectedIndex].value
    var queryTokens = tokenize(queryTerm)
    var queryTerm = queryTokens.pop() 
    if(queryTerm.match(/^\".*\"$/)) {
        queryTerm = queryTerm.replace(/^\"/,'').replace(/\"$/,'')
    }
    document.getElementById("queryTerm").value = queryTerm.replaceAll("\"\"","\"")
    
    const relator = document.getElementById("relator")
    relator.value = queryTokens.pop()
    if(relator.value == "") {
        relator.selectedIndex = 0
    }

    const index = document.getElementById("index")
    const valToDelete = queryTokens.pop()
    index.value = valToDelete
    if(index.value == "") {
        index.selectedIndex = 0
    }

    document.getElementById("addTermButton").disabled = false
    if(queryTokens.length > 0) {
        document.getElementById("operator").value = queryTokens.pop().toLowerCase()
    }
    
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
    document.getElementById("operator").disabled = true;
    document.getElementById("deleteTermButton").disabled = true;
    document.getElementById("clearTermsButton").disabled = true;
    if(document.getElementById("queryTerm").value.length > 0) {
        document.getElementById("addTermButton").disabled = false
    }
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


document.getElementById("addResultButton").addEventListener("click", addResult);
function addResult() {
    var term = document.getElementById("resultField").value;
    term = decodeURIComponent(term)    
    if(term === "") {
        return;
    }
    if(term === "other") {
        term = document.getElementById("customResultField").value
    }
    var resultFields = document.getElementById("resultFieldsList");
    
    resultFields.add(new Option(term,term));  
    resultFields.scrollTop = resultFields.scrollHeight
    document.getElementById("deleteResultButton").disabled = false;
    document.getElementById("clearResultsButton").disabled = false;
    updateResultString()
    updateOrderButtons()
}

document.getElementById("deleteResultButton").addEventListener("click", deleteResult);
function deleteResult() {
    var resultFieldsList = document.getElementById("resultFieldsList")
    var resultField = document.getElementById("resultField")

    if(resultFieldsList.selectedIndex !== -1) {
        resultField.value = resultFieldsList.value
        setCustomResult(resultFieldsList.value)
        resultFieldsList.remove(resultFieldsList.selectedIndex);
    }
    
    if(resultFieldsList.length === 0) {
        document.getElementById("deleteResultButton").disabled = true;
        document.getElementById("clearResultsButton").disabled = true;
    }
    updateResultString()
    updateOrderButtons()
}

document.getElementById("clearResultsButton").addEventListener("click", clearResults);
function clearResults() {
    document.getElementById("resultFieldsList").innerHTML = '';
    document.getElementById("deleteResultButton").disabled = true;
    document.getElementById("clearResultsButton").disabled = true;
    updateResultString()
    updateOrderButtons()
}

document.getElementById("resultFieldsList").addEventListener("change",updateOrderButtons)

document.getElementById("resultField").addEventListener("change", toggleCustomResult)   
function toggleCustomResult() {
    const customResultField = document.getElementById("customResultField")
    const resultField = document.getElementById("resultField")
    if(resultField.options[resultField.selectedIndex].value == "other") {
        customResultField.disabled = false
    } else {
        customResultField.disabled = true
    }
}

document.getElementById("moveUpButton").addEventListener('click',function() {
    const resultFieldsList = document.getElementById("resultFieldsList")
    const selectedIndex = resultFieldsList.selectedIndex
    if(selectedIndex > 0) {
        const opt1 = resultFieldsList.options[selectedIndex-1]
        const opt2 = resultFieldsList.options[selectedIndex]
        resultFieldsList.insertBefore(opt2,opt1)
    }
    updateResultString()
    updateOrderButtons()
})

document.getElementById("moveDownButton").addEventListener('click',function() {
    const resultFieldsList = document.getElementById("resultFieldsList")
    const selectedIndex = resultFieldsList.selectedIndex
    if(selectedIndex < resultFieldsList.length - 1) {
        const opt1 = resultFieldsList.options[selectedIndex]
        const opt2 = resultFieldsList.options[selectedIndex+1]
        resultFieldsList.insertBefore(opt2,opt1)
    }
    updateResultString()
    updateOrderButtons()
})


function updateOrderButtons() {
    const resultFieldsList = document.getElementById("resultFieldsList")
    const moveUpButton = document.getElementById("moveUpButton")
    const moveDownButton = document.getElementById("moveDownButton")

    moveUpButton.disabled = (resultFieldsList.selectedIndex < 1)
    moveDownButton.disabled = (resultFieldsList.length < 2 || resultFieldsList.selectedIndex == -1 ||
        resultFieldsList.selectedIndex >= resultFieldsList.length - 1)
}

function updateResultString() {
    var options = Array.from(document.getElementById("resultFieldsList").options)
    var resultString = options.map(option => option.value).join("|")
    document.getElementById("displayFields").value = resultString; 
}



function tokenize(str) {
    str = str.replaceAll("\"\"","{quote}")
    const regex = /"([^"\\]|\\.)+"|[^\s]+/g;
    let matches = [];
    let match;
    while ((match = regex.exec(str)) !== null) {
        matches.push(match[0].replaceAll("{quote}","\"\""));
    }
    return matches;
}