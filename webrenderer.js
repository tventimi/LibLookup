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
    const regex = /"[^"]+"|[^\s]+/g;
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

function download(format) {
    var origin = window.location.origin
    var queryString = window.location.search
    queryString = queryString.replace(/&start=[0-9]+/,'')
    var resultCount = document.getElementById("resultCount").innerHTML
    resultCount = resultCount.replace(/.*of ([0-9]+).*/,'$1')
    var queryBatch = []
    const increment = 50
    for(var i = 1; i <= resultCount; i += increment) {
        var maxRecs = (i+increment <= resultCount) ? increment : ((resultCount - i + 1))
        queryBatch.push(`${origin}/${queryString}&start=${i}&maxRecs=${maxRecs}&format=${format}`)
    }
    var downloadStatus = document.getElementById('downloadStatus')
    var readyForNext = true
    var qi = 0

    var allRecords = []

    var queryInterval = setInterval(() => {
        if(!readyForNext) {
            return
        }
        if(qi == queryBatch.length) {
            downloadStatus.innerHTML = "Done!"
            clearInterval(queryInterval)
            const contentType = (format == 'csv') ? 'application/csv' : 'application/mrc'
            console.log(allRecords)
            const fileBlob = new Blob([allRecords.join("\n")])
            const blobUrl = URL.createObjectURL(fileBlob);
  
            const link = document.createElement('a');
            link.style.display = 'none';
            link.href = blobUrl;
            link.download = "LibLookupResults." + format;
            link.click();
  
            document.removeChild(link);
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
                var recs = resp.split('\n').map(rec => rec.replace(/^[0-9 ]+,/,''))
                if(qi > 1) {
                    recs.shift()
                }
                if(recs[recs.length-1] == "") {
                    recs.pop()
                }
                allRecords.push(...recs)
            })
        })
    },500)
}


