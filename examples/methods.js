import { ofetch } from 'ooofetch'

const response = await ofetch('https://api.github.com/gists', {
  method: 'POST',
}) // Be careful, we use the GitHub API directly.

console.log(response)
