# CLSI seccomp profile rationale and testing

This folder contains the `clsi-profile.json` seccomp profile used by the `clsi` Docker runner. The profile is intentionally restrictive, but some packages and runtimes (especially modern glibc or runtime libraries used by Node or other compiled tools) require event loop-related syscalls and newer clone semantics.

What this patch does:
- Adds `poll`, `select`, `pselect6` and `epoll_*` syscalls that are commonly used by event-driven programs and by the LaTeX toolchain's runtime (e.g., services/libs that use epoll/poll under the hood).
- Allows `clone3` (previously explicitly denied) to prevent misdetection of the syscall being used and causing subtle errors in newer libraries. This is a tradeoff: `clone3` has additional capabilities, but it is necessary for some modern userspace to function correctly.

Security tradeoffs:
- Allowing `clone3` increases the available surface area for attacker exploitation; however, the container runtime already isolates capabilities and namespaces. If you want to be stricter, you can keep `clone3` denied and only allow it conditionally by checking arguments (not implemented in the basic profile), or audit precisely which userspace libraries require it.
- We recommend: keep the profile minimal and only make these syscall additions as required. If you know your image's runtime doesn't require `clone3`, you can revert it to an errno action.

Testing the profile locally:
1. Build a small C program that calls `epoll_create1`, `epoll_ctl`, `epoll_wait`, `poll`, and `pselect`:
   - See `test_syscalls.c` for an example.
2. Build & run the test inside a container using the profile applied (the tests show which syscalls fail or succeed). Example using `docker run`:

```bash
# Build the test program
gcc -o test_syscalls test_syscalls.c

# Run inside a container with the seccomp profile
docker run --rm -it --security-opt seccomp=$(pwd)/clsi-profile.json -v $(pwd):/workdir -w /workdir debian:stable-slim ./test_syscalls
```

If all allowed syscalls execute successfully, the program should return a 0 exit code and report success for each syscall.

Notes:
- A full integration test depends on the actual LaTeX image and the host environment; it is recommended to run the actual `clsi` compile job under the same profile in a staging environment and check logs for ENOSYS or other errors.
- If you want to propose the patch as a PR we can add the following to the PR description:
  - Motivation and the tests performed
  - The minimal list of syscalls added
  - A note about the potential security tradeoffs and how to revert the allowance if needed

Thanks for offering to prepare the PR!
