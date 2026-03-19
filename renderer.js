var resultsList = document.getElementById('results')
const queryForm = document.getElementById('queryForm')
const queryString = document.getElementById('queryString')

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