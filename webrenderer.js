const urlParams = new URLSearchParams(window.location.search)
var abort = false

const queryForm = document.getElementById("queryForm")
const inputs = queryForm.querySelectorAll('select, input');

populateForm()

function populateForm() {
  if(urlParams.size == 0) { //start page, clear all saved values
    inputs.forEach(input => {
        localStorage.setItem(input.id,"")
    })
    return
  } 
  //else if there are URL params  
  urlParams.forEach((value, key) => {
    if(key === "catalog") {
        document.getElementById("catalog").value = value
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
        document.getElementById("deleteTermButton").disabled = false
        document.getElementById("clearTermsButton").disabled = false
        document.getElementById("operator").disabled = false
    } else if(key === "displayFields") {
        document.getElementById("displayFields").value = value
        var displayFields = value
        const resultFieldsList = document.getElementById("resultFieldsList")
        const fieldList = decodeURIComponent(displayFields).split("|")
        for(i = 0; i < fieldList.length; i++) {
            resultFieldsList.append(new Option(fieldList[i],fieldList[i]))
        }
        document.getElementById("deleteResultButton").disabled = false
        document.getElementById("clearResultsButton").disabled = false
    } 
  });
}

document.addEventListener('DOMContentLoaded',function() {
    inputs.forEach(input => {
        if(input.id === "queryTerm" || input.id === "searchTerms" || 
            input.id === "catalog" || input.id === "displayFields") {
            return
        }
        const savedValue = localStorage.getItem(input.id);
        if (savedValue && input.checkVisibility()) {
            input.value = savedValue;
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if(input.value == "" && input.nodeName == "SELECT" && input.options.length > 0) {
            input.value = input.options[0].value;    
            input.dispatchEvent(new Event('change', { bubbles: true }));        
            if(input.id == "index" || input.id == "resultField") {
                const savedContents = localStorage.getItem(input.id + "Contents");
                input.innerHTML = savedContents
            }
        }
    });
    document.getElementById("submit").addEventListener('click', function() {
        document.getElementById("catalogLink").innerHTML = "Searching..."
    })
})


queryForm.addEventListener('submit', function(event) {    
    const formControls = event.target.elements;
    Array.from(formControls).forEach(element => {
        if ((element.tagName === 'SELECT' || element.tagName === 'INPUT') 
                && element != "SECONDARY_INDEX") {
            localStorage.setItem(element.id, element.value); 
            if(element.id == "index") {
                localStorage.setItem(element.id + "Contents", element.innerHTML)
            }
        }
    })
});


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

document.getElementById("downloadMRC").addEventListener('click', () => {
    download('mrc')
})

document.getElementById("downloadCSV").addEventListener('click', () => {
    download('csv')
})

document.getElementById("abortButton").addEventListener('click', () => {
    abort = true
})


function download(format) {
    var origin = window.location.origin
    var queryString = window.location.search
    var downloadStatus = document.getElementById('downloadStatus')
    document.getElementById("abortButton").disabled = false    
    downloadStatus.innerHTML = "Downloading..."
    abort = false
    queryString = queryString.replace(/&start=[0-9]+/,'')
    queryString = queryString.replace(/&maxRecs=[0-9]+/,'')
    var resultCount = document.getElementById("resultCount").innerHTML
    if(queryString.match(/singleRecord=true/)) {
        resultCount = "1"
    }
    resultCount = resultCount.replace(/.*of ([0-9]+).*/,'$1')
    var queryBatch = []
    const increment = 50
    for(var i = 1; i <= resultCount; i += increment) {
        var maxRecs = (i+increment <= resultCount) ? increment : ((resultCount - i + 1))
        queryBatch.push(`${origin}/${queryString}&start=${i}&maxRecs=${maxRecs}&format=${format}`)
    }
    
    var readyForNext = true
    var qi = 0

    var allRecords = []

    var queryInterval = setInterval(() => {
        if(!readyForNext) {
            return
        }
        if(qi == queryBatch.length || abort) {
            downloadStatus.innerHTML = abort ? "Aborted" : "Done!"
            document.getElementById("abortButton").disabled = true
            clearInterval(queryInterval)
            if(abort) {
                return
            }
            const recSeparator = (format == 'csv') ? "\n" : "\x1D"
            const fileBlob = new Blob([
                ((format == 'csv') ? "\uFEFF" : '') + 
                allRecords.join(recSeparator) + 
                ((format == 'mrc') ? recSeparator : '')
            ])
            const blobUrl = URL.createObjectURL(fileBlob);
            const link = document.createElement('a');
            link.style.display = 'none';
            link.href = blobUrl;
            link.download = "LibLookupResults." + format;
            link.click();
  
            link.remove()
            URL.revokeObjectURL(blobUrl);
            return
        }
        readyForNext = false
        fetch(queryBatch[qi]).then((data) => {
            data.text().then((resp) => {
                qi++
                var completeCount = Math.min(qi*increment,resultCount)
                downloadStatus.innerHTML = `Downloaded ${completeCount} of ${resultCount} records`
                readyForNext = true
                var recs
                if(format == 'csv') {
                    recs = resp.split('\n').map(rec => rec.replace(/^[^,]+,/,''))
                    if(qi > 1) {
                        recs.shift()
                    }
                    if(recs[recs.length-1] == "") {
                        recs.pop()
                    }
                } else { //mrc
                    recs = resp.split("\x1D")
                    if(recs[recs.length-1] == "") {
                        recs.pop()
                    }
                }
                allRecords.push(...recs)
            })
        })
    },500)
}


