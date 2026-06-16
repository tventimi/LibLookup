document.getElementById('browserButton').addEventListener('click', () => {
    window.electronApi.sendClickEvent()
})