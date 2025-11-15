* config.sh
Change the docker path setting: DOCKER_BASE

* Make a test user joe@example.com:
bash 1_make_testuser.sh

* Test the joe example.com user (You need to wait for the cronjob inside the gitbackup container)
bash 2_get_empty_testuser_project_list.sh

* Test with any user in download dir (should preferable have a project):
bash 3_get_other_user_project_list.sh [USERNAME]
