const urlParams = new URLSearchParams(window.location.search)
var catalog = ""
var query = ""
var displayFields = ""
var abort = false

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
            document.getElementById("deleteTermButton").disabled = false
            document.getElementById("clearTermsButton").disabled = false
            document.getElementById("operator").disabled = false
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
    const regex = /"([^"\\]|\\.)+"|[^\s]+/g;
    let matches = [];
    let match;
    while ((match = regex.exec(str)) !== null) {
        matches.push(match[0]);
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
    downloadStatus.innerHTML = ""
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
            const contentType = (format == 'csv') ? 'text/csv; charset=utf-8' : 'application/mrc'
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
                var recs = []
                if(format == 'csv') {
                    var recs = resp.split('\n').map(rec => rec.replace(/^[0-9 ]+,/,''))
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


