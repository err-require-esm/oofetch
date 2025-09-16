import { ofetch } from 'oofetch'

const response = await ofetch('https://api.github.com/markdown', {
  // To provide a body, we need to use the `body` option and just use an object.
  body: {
    text: 'UnJS is **awesome**!\n\nCheck out their [website](https://unjs.io).',
  },
  method: 'POST',
})

console.log(response)
