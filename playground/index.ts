import process from 'node:process'

import { $fetch } from '../src'

async function main() {
  // const r = await $fetch<string>('http://google.com/404')
  const r = await $fetch<string>('https://httpstat.us/500')
  // const r = await $fetch<string>('http://httpstat/500')

  console.log(r)
}

main().catch((error) => {
  console.error(error)

  process.exit(1)
})
