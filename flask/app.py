# alexaScreenControl - github.com/djmango/alexaScreenControl
""" 
This is the main file for the flask middleman server that receives and interprets commands from
the external lambda function, associates the correct data, and sends a command to the local command server
"""


# TODO portforwarding!
# TODO code a default somehow, probably names in the source list (lazy way is to name it default)

# imports
import logging
import os
import subprocess
import time

import dotenv
import requests
from flask import Flask, jsonify
from flask_httpauth import HTTPBasicAuth
from flask_restful import Api, Resource, reqparse

# setup
app = Flask(__name__)
api = Api(app, prefix="/api/v1")
auth = HTTPBasicAuth()
dotenv.load_dotenv()
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)
parser = reqparse.RequestParser()
parser.add_argument('sourceName')
parser.add_argument('displayID')

CLIENT_AUTH = {os.getenv("AUTH_USER"): os.getenv("AUTH_PASS")}
SCREEN_API_IP = '10.54.10.38'
SCREEN_API_ENDPOINT = 'http://' + SCREEN_API_IP + ':9000/api'
# why not, doesn't really matter, its just if OK else
NOT_OKAY_MSG = 'NOT OKAY :('

# functions


def updateDuckDNS():
    """ Send a HTTPS request + authentication to DuckDNS, with our current public IP """
    url = 'https://www.duckdns.org/update'
    params = {
        'domains': os.getenv('DUCKDNS_DOMAIN'),
        'token': os.getenv("DUCKDNS_TOKEN"),
        'ip': requests.get('https://api.ipify.org').text,
        'verbose': 'true'}
    try:
        r = requests.get(url, params)
    except requests.exceptions.RequestException as e:
        logger.error(e)
        return NOT_OKAY_MSG
    logger.debug(r.text)
    return r.text


def screenLogin():
    login = {'user': os.getenv('SCREEN_USER'),
             'password': os.getenv('SCREEN_PASS')}
    try:
        r = requests.post(SCREEN_API_ENDPOINT + '/session', json=login)
    except requests.exceptions.RequestException as e:
        logger.error(e)
        return
    j = r.json()
    logger.debug(j)
    jar = requests.cookies.RequestsCookieJar()
    return j["session"]["value"]


def screenLogout(id):
    cookie = {'JSESSIONID': id}
    try:
        r = requests.delete(SCREEN_API_ENDPOINT + '/session', cookies=cookie)
    except requests.exceptions.RequestException as e:
        logger.error(e)
        return
    return True

# api routes


@auth.verify_password
def verify(username, password):
    if not (username and password):
        return False
    return CLIENT_AUTH.get(username) == password


class index(Resource):
    """ oh, what fun an index is """

    def get(self):
        return 'Hello there. Ya shouldn\'t be here'


class update(Resource):

    @auth.login_required
    def get(self):
        return updateDuckDNS()


class content(Resource):
    """ Content management handler for requests from the lambda function """

    @auth.login_required
    def get(self):
        """ Send the content list from the screen control server request to the Alexa lambda function"""

        sessionID = screenLogin()
        jar = requests.cookies.RequestsCookieJar()
        jar.set('JSESSIONID', sessionID, domain=SCREEN_API_IP, path='/api')
        try:
            # http://dev.userful.com/rest/#sources_get
            r = requests.get(SCREEN_API_ENDPOINT + '/sources', cookies=jar)
        except requests.exceptions.RequestException as e:
            logger.error(e)
            screenLogout(sessionID)
            return NOT_OKAY_MSG

        j = r.json()
        logger.debug(j)

        nameList = []
        for i in j['sources']:
            nameList.append(i['sourceName'])
        logger.debug(nameList)
        screenLogout(sessionID)
        return jsonify(nameList)

    @auth.login_required
    def post(self):
        """ Interpret the content change request and play it on the appropriate screen """

        sessionID = screenLogin()
        args = parser.parse_args()
        jar = requests.cookies.RequestsCookieJar()
        jar.set('JSESSIONID', sessionID, domain=SCREEN_API_IP, path='/api')
        logger.debug(args)

        # display id's: 1: videowall, 5: k2, 6: back conference room (k3 or whatever)
        # i know the id's seem off but it makes sense techincally (4 screens for videowall)

        try:
          
            if args['displayID'] == '1':
                url = SCREEN_API_ENDPOINT + '/zones/byname/videowall/switch'
                data = {'destinationSourceName': args['sourceName']}
                r = requests.put(url, json=data, cookies=jar, params=data)
            else:
              # http://dev.userful.com/rest/#displays__displayid__switch_put
                url = SCREEN_API_ENDPOINT + '/displays/' + \
                    args['displayID'] + '/switch'
                data = {'sourceName': args['sourceName']}
                r = requests.put(url, json=data, cookies=jar)

        except requests.exceptions.RequestException as e:
            logger.error(e)
            screenLogout(sessionID)
            return NOT_OKAY_MSG

        screenLogout(sessionID)
        return 'OKAY'


api.add_resource(index, '/')
api.add_resource(update, '/update')
api.add_resource(content, '/content')

# run in debug if we're just running this file on its own
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)

# docs
# https://flask-restful.readthedocs.io/en/latest/
# https://flask.palletsprojects.com/en/1.1.x/api/#
# https://jjssoftware.github.io/secure-your-esp8266/
