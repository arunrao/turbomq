# Contributing to TurboMQ

We love your input! We want to make contributing to TurboMQ as easy and transparent as possible, whether it's:

- Reporting a bug
- Discussing the current state of the code
- Submitting a fix
- Proposing new features
- Becoming a maintainer

## We Develop with Github

We use GitHub to host code, to track issues and feature requests, as well as accept pull requests.

## We Use [Github Flow](https://guides.github.com/introduction/flow/index.html)

Pull requests are the best way to propose changes to the codebase. We actively welcome your pull requests:

1. Fork the repo and create your branch from `main`.
2. If you've added code that should be tested, add tests.
3. If you've changed APIs, update the documentation.
4. Ensure the test suite passes.
5. Make sure your code lints.
6. Issue that pull request!

## Any contributions you make will be under the MIT Software License

In short, when you submit code changes, your submissions are understood to be under the same [MIT License](http://choosealicense.com/licenses/mit/) that covers the project. Feel free to contact the maintainers if that's a concern.

## Report bugs using Github's [issue tracker](https://github.com/arunrao/turbomq/issues)

We use GitHub issues to track public bugs. Report a bug by [opening a new issue](https://github.com/arunrao/turbomq/issues/new); it's that easy!

## Write bug reports with detail, background, and sample code

**Great Bug Reports** tend to have:

- A quick summary and/or background
- Steps to reproduce
  - Be specific!
  - Give sample code if you can.
- What you expected would happen
- What actually happens
- Notes (possibly including why you think this might be happening, or stuff you tried that didn't work)

## Development Process

1. Clone the repository
```bash
git clone https://github.com/arunrao/turbomq.git
cd turbomq
```

2. Install dependencies
```bash
npm install
```

3. Set up the development environment
```bash
# Create a .env file with your database configuration
cp .env.example .env
```

4. Run the development server
```bash
npm run dev
```

## Testing

We use Jest for testing. Run the test suite with:

```bash
npm test
```

## Code Style

We use ESLint and Prettier for code formatting. Run the linter with:

```bash
npm run lint
```

And format your code with:

```bash
npm run format
```

## Documentation

We maintain comprehensive documentation in the `docs/` directory. The API reference is generated from code comments.

Key documentation files:
- `API_REFERENCE.md`: Complete API documentation
- `DEPLOYMENT.md`: Deployment strategies and configurations
- `example-regular.md`: Examples of regular job usage
- `example-scheduled.md`: Examples of scheduled job usage

When contributing new features, please update the relevant documentation.

## Pull Request Process

1. Update the README.md with details of changes to the interface, if applicable.
2. Update the docs/ directory with any new documentation.
3. The PR will be merged once you have the sign-off of at least one other developer.
4. Make sure all tests pass and the code is properly formatted.

## Code of Conduct

### Our Pledge

We as members, contributors, and leaders pledge to make participation in our
community a harassment-free experience for everyone, regardless of age, body
size, visible or invisible disability, ethnicity, sex characteristics, gender
identity and expression, level of experience, education, socio-economic status,
nationality, personal appearance, race, religion, or sexual identity
and orientation.

### Our Standards

Examples of behavior that contributes to a positive environment for our
community include:

* Demonstrating empathy and kindness toward other people
* Being respectful of differing opinions, viewpoints, and experiences
* Giving and gracefully accepting constructive feedback
* Accepting responsibility and apologizing to those affected by our mistakes,
  and learning from the experience
* Focusing on what is best not just for us as individuals, but for the
  overall community

Examples of unacceptable behavior include:

* The use of sexualized language or imagery, and sexual attention or
  advances of any kind
* Trolling, insulting or derogatory comments, and personal or political attacks
* Public or private harassment
* Publishing others' private information, such as a physical or email
  address, without their explicit permission
* Other conduct which could reasonably be considered inappropriate in a
  professional setting

### Enforcement Responsibilities

Community leaders are responsible for clarifying and enforcing our standards of
acceptable behavior and will take appropriate and fair corrective action in
response to any behavior that they deem inappropriate, threatening, offensive,
or harmful.

Community leaders have the right and responsibility to remove, edit, or reject
comments, commits, code, wiki edits, issues, and other contributions that are
not aligned to this Code of Conduct, and will communicate reasons for moderation
decisions when appropriate.

### Scope

This Code of Conduct applies within all community spaces, and also applies when
an individual is officially representing the community in public spaces.

### Enforcement

Instances of abusive, harassing, or otherwise unacceptable behavior may be
reported to the community leaders responsible for enforcement at
[turbomq@example.com](mailto:turbomq@example.com).
All complaints will be reviewed and investigated promptly and fairly.

All community leaders are obligated to respect the privacy and security of the
reporter of any incident.

### Attribution

This Code of Conduct is adapted from the [Contributor Covenant](https://www.contributor-covenant.org),
version 2.0, available at
https://www.contributor-covenant.org/version/2/0/code_of_conduct.html.

## License

By contributing, you agree that your contributions will be licensed under its MIT License. 