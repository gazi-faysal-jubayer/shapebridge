# Governance & community

## Roles

- **Maintainer** (currently @gazi-faysal-jubayer): merges PRs, cuts releases, owns the roadmap.
- **Area owners** (as people join): viewer, formats, kernel/parametric, interop, share, desktop. Listed in `CODEOWNERS` once there are two or more people.
- **Contributors:** anyone with a merged PR.

## Decisions

- Small changes need review from one maintainer.
- Changes that affect architecture or licensing need an ADR in `docs/adr/NNNN-title.md`, open for comment for 7 days. The `engineering:architecture` agent skill can draft one.

## Labels for newcomers

- `good first issue`: a scoped change to 1–2 files with clear acceptance criteria.
- `help wanted`: the maintainer won't get to it soon.

## Communication

- GitHub Issues for bugs and features.
- GitHub Discussions for questions and ideas.
- Releases for announcements.

## Licence policy

- Core: Apache-2.0. Contributions are accepted under the same licence (inbound = outbound, no CLA).
- Dependencies must be Apache, MIT, BSD, ISC, MPL or LGPL. LGPL is allowed only as a dynamically loaded module.
- GPL code and closed SDKs live only in opt-in plugins in separate repositories.
