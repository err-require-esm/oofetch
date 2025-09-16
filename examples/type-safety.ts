import { ofetch } from 'oofetch'

interface Repo {
  description: string
  id: number
  name: string
  repo: string
  stars: number
}

async function main() {
  const { repo } = await ofetch<{ repo: Repo }>(
    'https://ungh.cc/repos/unjs/ofetch',
  )

  console.log(`The repo ${repo.name} has ${repo.stars} stars.`) // The repo object is now strongly typed.
}

main().catch(console.error)
