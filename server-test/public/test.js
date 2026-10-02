const form = document.querySelector('#test-form')
const input = document.querySelector('#access-token')
const button = document.querySelector('#run')
const status = document.querySelector('#status')
const report = document.querySelector('#report')

form.addEventListener('submit', async event => {
  event.preventDefault()
  if (button.disabled) return
  const token = input.value.trim()
  input.value = ''
  button.disabled = true
  report.hidden = true
  report.textContent = ''
  status.textContent = 'Checking candles and price-info from this server…'
  try {
    const response = await fetch('/api/check', {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(25_000),
    })
    const data = await response.json()
    if (!response.ok) {
      status.textContent = ({ unauthorized: 'The test access token did not match. Enter it again.',
        test_not_configured: 'Add all three server environment variables, then redeploy.',
        wait_before_retry: 'Wait 20 seconds before running the test again.' })[data.error]
        || 'The server test could not finish. Check the deployment and try again.'
      return
    }
    report.textContent = JSON.stringify(data, null, 2)
    report.hidden = false
    status.textContent = data.result === 'both_accepted'
      ? 'Binance accepted both requests. Check each item count before calling the data usable.'
      : 'At least one request was not accepted. The report contains the HTTP status and provider code for each.'
  } catch { status.textContent = 'Could not reach the test endpoint. Check the deployment and try again.' }
  finally { button.disabled = false }
})
