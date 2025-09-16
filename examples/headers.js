import process from 'node:process'
import { ofetch } from 'oofetch'

const response = await ofetch('https://api.github.com/gists', {
  body: {
    description: 'This is a gist created by ofetch.',
    files: {
      'unjs.txt': {
        content: 'UnJS is awesome!',
      },
    },
    public: true,
  },
  headers: {
    Authorization: `token ${process.env.GH_TOKEN}`,
  },
  method: 'POST',
}) // Be careful, we use the GitHub API directly.

console.log(response.url)
