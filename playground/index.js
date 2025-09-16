import process from 'node:process'

import { $fetch } from '..'

async function main() {
  await $fetch('https://google.com/404')
}

main().catch((error) => {
  console.error(error)

  process.exit(1)
})
