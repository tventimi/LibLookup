var resultsList = document.getElementById('results')
const queryForm = document.getElementById('queryForm')
const queryString = document.getElementById('queryString')
const catalogSelect = document.querySelector('#catalog')

window.electronApi.setResults((value) => {
    resultsList.innerHTML = value
})

queryForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = {
        queryString: queryString.value,
    };
    window.electronApi.submitForm(formData);  
});

catalogSelect.addEventListener('change', (event) => {
    console.log('Selected Catalog:', event.target.value);
    window.electronApi.connect(event.target.value)  
})