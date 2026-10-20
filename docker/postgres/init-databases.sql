-- Runs only on a fresh volume. Environment values are quoted as SQL literals.
\getenv dev_password CLU_DEV_PASSWORD
\getenv test_password CLU_TEST_PASSWORD
CREATE ROLE clu_dev LOGIN NOSUPERUSER CREATEDB NOCREATEROLE PASSWORD :'dev_password';
CREATE ROLE clu_test LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'test_password';
CREATE DATABASE clu_store_dev OWNER clu_dev;
CREATE DATABASE clu_store_test OWNER clu_test;
REVOKE CONNECT ON DATABASE clu_store_dev FROM PUBLIC;
REVOKE CONNECT ON DATABASE clu_store_test FROM PUBLIC;
GRANT CONNECT ON DATABASE clu_store_dev TO clu_dev;
GRANT CONNECT ON DATABASE clu_store_test TO clu_test;
