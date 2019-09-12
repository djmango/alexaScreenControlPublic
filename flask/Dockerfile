FROM ubuntu:bionic


WORKDIR /app/
COPY . .

RUN apt-get update -y && \
    apt-get install python3-pip python3-dev openssl curl -y
RUN ["bash", "/app/dehydrated/dehydrated", "--cron"]
RUN pip3 install --no-cache -r requirements.txt