document.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search)
    urlParams.forEach((value, key) => {
        if(key === "catalog") {
            document.getElementById("catalog").value = value
        } else if(key === "q") {
            document.getElementById("queryString").value = value
        }
    })
})