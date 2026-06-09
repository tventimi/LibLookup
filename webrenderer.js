document.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search)
    var catalog = ""
    var query = ""
    urlParams.forEach((value, key) => {
        if(key === "catalog") {
            document.getElementById("catalog").value = value
            catalog = value
        } else if(key === "q") {
            document.getElementById("queryString").value = value
            query = value
        }
    })
    if(catalog && query) {
        document.title = "LibLookup: " + catalog + " " + query
    }
})