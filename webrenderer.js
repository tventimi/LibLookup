const urlParams = new URLSearchParams(window.location.search)
var catalog = ""
var query = ""
var displayFields = ""

fetch('./config/catalogs.json').then((res) => {
    res.json().then((catalogList) => {
        var catalogSelect = document.getElementById('catalog')
        Object.keys(catalogList).forEach((cat) => {
            var opt = new Option(catalogList[cat].name,cat)
            catalogSelect.appendChild(opt)
        })
    })
})

urlParams.forEach((value, key) => {
    if(key === "catalog") {
        document.getElementById("catalog").value = value
        catalog = value
    } else if(key === "q") {
        document.getElementById("queryString").value = value
        query = value
    } else if(key === "displayFields") {
        document.getElementById("displayFields").value = value
        displayFields = value
    }
})
if(catalog && query) {
    document.title = "LibLookup: " + catalog + " " + query
}

