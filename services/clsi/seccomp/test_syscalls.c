// Minimal test program to exercise epoll and poll syscalls
// Compile: gcc -Wall -o test_syscalls test_syscalls.c
// Run under seccomp profile as shown in README to validate which syscalls are allowed

#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/epoll.h>
#include <poll.h>
#include <sys/select.h>

int main(void)
{
    int ok = 0;

    // Test epoll_create1
    int epfd = epoll_create1(0);
    if (epfd == -1) {
        perror("epoll_create1");
    } else {
        printf("epoll_create1 OK: %d\n", epfd);
        ok++;
    }

    // Test epoll_ctl with an invalid fd (should errno with EINVAL or EBADF but syscall must be allowed)
    struct epoll_event ev;
    ev.events = EPOLLIN;
    ev.data.fd = 0;
    if (epoll_ctl(epfd, EPOLL_CTL_ADD, 0, &ev) == -1) {
        perror("epoll_ctl");
    } else {
        printf("epoll_ctl OK\n");
        ok++;
    }

    // Test epoll_wait
    struct epoll_event evlist[1];
    int n = epoll_wait(epfd, evlist, 1, 1);
    if (n == -1) {
        perror("epoll_wait");
    } else {
        printf("epoll_wait OK (n=%d)\n", n);
        ok++;
    }

    // Test poll
    struct pollfd pfd;
    pfd.fd = 0; pfd.events = POLLIN;
    int p = poll(&pfd, 1, 1);
    if (p == -1) {
        perror("poll");
    } else {
        printf("poll OK (p=%d)\n", p);
        ok++;
    }

    // Test pselect6 via pselect (should map to pselect6 syscall)
    fd_set rset;
    FD_ZERO(&rset);
    FD_SET(0, &rset);
    struct timespec ts;
    ts.tv_sec = 0; ts.tv_nsec = 1000000;
    int s = pselect(1, &rset, NULL, NULL, &ts, NULL);
    if (s == -1) {
        perror("pselect");
    } else {
        printf("pselect OK (s=%d)\n", s);
        ok++;
    }

    close(epfd);

    printf("Summary: %d checks passed\n", ok);
    return (ok == 5) ? 0 : 2;
}
