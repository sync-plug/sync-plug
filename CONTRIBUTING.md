# Contributing to Sync Plug

Thank you for your interest in contributing to Sync Plug! We welcome contributions from everyone. By participating in this project, you agree to abide by our code of conduct.

## Getting Started

1.  **Fork the repository** on GitHub.
2.  **Clone your fork** locally:
    ```bash
    git clone https://github.com/sync-plug/sync-plug.git
    cd sync-plug
    ```
3.  **Install dependencies**:
    ```bash
    npm install
    ```

## Development Workflow

### Branching
-   Use `main` for the latest stable code.
-   Create a new branch for each feature or bug fix:
    ```bash
    git checkout -b feature/my-new-feature
    ```

### Running Tests
To ensure your changes don't break existing functionality, run:
```bash
npm run test
# or if you haven't set up tests yet, ensure the build passes
npm run build
```

### Submitting a Pull Request
1.  Push your branch to your fork.
2.  Open a Pull Request against the `main` branch.
3.  Describe your changes and link to any relevant issues.

## Release Process (Maintainers Only)

We use Semantic Versioning.
-   **Patch**: `npm version patch` (Bug fixes)
-   **Minor**: `npm version minor` (New features, backward compatible)
-   **Major**: `npm version major` (Breaking changes)

### Beta Releases
For testing new features before a stable release:
```bash
npm version prerelease --preid=beta
npm publish --tag beta
```

## Reporting Bugs & Feature Requests
Please use the [Issue Tracker](https://github.com/sync-plug/sync-plug/issues) to report bugs or suggest features.
