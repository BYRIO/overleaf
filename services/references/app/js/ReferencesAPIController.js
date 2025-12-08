// const SpellingAPIManager = require('./SpellingAPIManager')
const logger = require('logger-sharelatex')
const metrics = require('@overleaf/metrics')
const OError = require('@overleaf/o-error')
const request = require('request')
const async = require('async')

const bibParse = require('./BibParser')

// req: { allUrls: string[], fullIndex: boolean }
// res: { keys: string[]}
module.exports = {
  index(req, res) {
    const { docUrls, fullIndex } = req.body;
    async.parallel(docUrls.map(docUrl => function(cb){request.get(docUrl, cb)}), function(err, argsList){
      let keys = [];
      argsList.forEach(([res, body]) => {
        if(body){
          try{
            const result = bibParse(body);
            const resultKeys = Object.keys(result);
            keys.push(...resultKeys);
          } catch(error) {
            logger.error({error}, "skip the file.")
          }
        }
      });
      logger.info({ keys }, "all keys");
      res.send({ keys })
    })
  }
}
