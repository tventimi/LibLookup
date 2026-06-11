var resultsList = document.getElementById('results')
const queryForm = document.getElementById('queryForm')
const queryString = document.getElementById('queryString')
const displayFields = document.getElementById('displayFields')
const catalogSelect = document.querySelector('#catalog')

document.addEventListener('DOMContentLoaded', () => {
    fetch('./config/catalogs.json').then((res) => {
        res.json().then((catalogList) => {
            Object.keys(catalogList).forEach((cat) => {
                var opt = new Option(catalogList[cat].name,cat)
                catalogSelect.appendChild(opt)
            })
        })
    })
})

window.electronApi.setResults((value) => {
    resultsList.innerHTML = value
})

queryForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = {
        queryString: queryString.value,
        displayFields: displayFields.value
    };
    window.electronApi.submitForm(formData);  
});

catalogSelect.addEventListener('change', (event) => {
    console.log('Selected Catalog:', event.target.value);
    window.electronApi.connect(event.target.value)  
})