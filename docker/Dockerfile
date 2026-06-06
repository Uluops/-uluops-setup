# @uluops/setup test substrate
#
# Reproduces the "fresh OS, `npx @uluops/setup`" execution context that local
# `npm test` cannot — specifically the npx transient-cache PATH semantics that
# caused the 0.7.0 agent-metrics false-positive (see CHANGELOG [0.7.1]).
#
# Built once, run disposable per scenario via `docker run --rm`. Image carries
# the slow setup cost (apt, Node, Claude Code CLI) so per-iteration cost is
# `docker run` only.

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Curl + ca-certs to fetch NodeSource; gnupg for the NodeSource keyring;
# git because some setup paths probe for it (project-root detection).
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      curl ca-certificates gnupg git \
 && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

# Claude Code CLI — the primary harness setup targets. Installed at image
# build time so detection has a real `claude` bin on PATH. Note that the
# harness DETECTION key is the existence of ~/.claude/ on disk (see
# packages/-uluops-setup/src/harnesses/index.ts:72) — scenarios that want the
# detection to fire create that dir themselves, scenarios that want the
# "no harness detected" fallback path leave it absent.
RUN npm install -g @anthropic-ai/claude-code

# Non-root user matches real-user PATH semantics. uid 1000 matches the
# typical first-user uid on Ubuntu/WSL so bind-mounted files retain
# sensible ownership if anyone mounts a host directory in.
RUN useradd -m -u 1000 -s /bin/bash tester
USER tester
WORKDIR /home/tester

# Per-user npm prefix so `npm install -g` works without sudo — matches
# how Alex's WSL environment behaves (where global installs land in a
# user-owned prefix, not /usr/lib). Without this, setup's
# `npm install -g @uluops/agent-metrics` fails with EACCES under tester
# and the regression-guard scenario would mistake an env issue for a
# real bug.
ENV NPM_CONFIG_PREFIX=/home/tester/.npm-global
ENV PATH=/home/tester/.npm-global/bin:$PATH
RUN mkdir -p /home/tester/.npm-global \
 && echo 'export NPM_CONFIG_PREFIX=/home/tester/.npm-global' >> /home/tester/.profile \
 && echo 'export PATH=/home/tester/.npm-global/bin:$PATH' >> /home/tester/.profile \
 && echo 'export NPM_CONFIG_PREFIX=/home/tester/.npm-global' >> /home/tester/.bashrc \
 && echo 'export PATH=/home/tester/.npm-global/bin:$PATH' >> /home/tester/.bashrc

# Sanity sentinel — scenarios `cat ~/.uluops-test-marker` to confirm they're
# running inside this image and not someone's host shell.
RUN echo "uluops-setup-test-container" > /home/tester/.uluops-test-marker

# Scenario scripts are bind-mounted at /scenarios by the test driver, so the
# image doesn't need rebuilding when scenarios change. The setup package
# tarball arrives at /pkg/setup.tgz.
ENTRYPOINT ["/bin/bash"]
