#!/bin/sh

###
# Copyright (C) Balena.io - All Rights Reserved
# Unauthorized copying of this file, via any medium is strictly prohibited.
# Proprietary and confidential.
###

export DOCKER_BUILDKIT=1

dockerd 2>&1 >/dev/null | grep -v level=info &
docker_pid=$!
# wait for docker startup
while ! docker info >/dev/null 2>&1; do
	if ! kill -0 $docker_pid ; then
		echo "Docker didn't start!"
		exit 1
	fi
	echo "waiting for Docker to start..."
	sleep 1s
done

exec "$@"
