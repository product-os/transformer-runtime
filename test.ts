import Dockerode = require("dockerode");


async function main () {
  const docker = new Dockerode()
  const containers = await docker.listContainers({
    all: true,
    filters: {
      label: [
        'balena.io/image=' + imageRef,
      ],
    },
  });
  console.log(containers)
  if (containers.length > 0) {
    return containers[0].Id
  } else {
    return null
  }
}

main()
