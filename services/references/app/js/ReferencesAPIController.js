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
          const result = bibParse(body);
          const resultKeys = Object.keys(result);
          keys.push(...resultKeys);
        }
      });
      keys = keys.filter(item => item !== '@comments');
      logger.info({ keys }, "all keys");
      res.send({ keys })
    })
  }

  //   check(req, res) {
  //     metrics.inc('spelling-check', 0.1)
  //     const { token, wordCount } = extractCheckRequestData(req)
  //     logger.info({ token, wordCount }, 'running check')
  //     SpellingAPIManager.runRequest(token, req.body, function (error, result) {
  //       if (error != null) {
  //         logger.error(
  //           OError.tag(error, 'error processing spelling request', {
  //             user_id: token,
  //             wordCount,
  //           })
  //         )
  //         return res.sendStatus(500)
  //       }
  //       res.send(result)
  //     })
  //   },

  //   learn(req, res, next) {
  //     metrics.inc('spelling-learn', 0.1)
  //     const { token, word } = extractLearnRequestData(req)
  //     logger.info({ token, word }, 'learning word')
  //     SpellingAPIManager.learnWord(token, req.body, function (error) {
  //       if (error != null) {
  //         return next(OError.tag(error))
  //       }
  //       res.sendStatus(204)
  //     })
  //   },

  //   unlearn(req, res, next) {
  //     metrics.inc('spelling-unlearn', 0.1)
  //     const { token, word } = extractLearnRequestData(req)
  //     logger.info({ token, word }, 'unlearning word')
  //     SpellingAPIManager.unlearnWord(token, req.body, function (error) {
  //       if (error != null) {
  //         return next(OError.tag(error))
  //       }
  //       res.sendStatus(204)
  //     })
  //   },

  //   deleteDic(req, res, next) {
  //     const { token, word } = extractLearnRequestData(req)
  //     logger.log({ token, word }, 'deleting user dictionary')
  //     SpellingAPIManager.deleteDic(token, function (error) {
  //       if (error != null) {
  //         return next(OError.tag(error))
  //       }
  //       res.sendStatus(204)
  //     })
  //   },

  //   getDic(req, res, next) {
  //     const token = req.params ? req.params.user_id : undefined
  //     logger.info(
  //       {
  //         token,
  //       },
  //       'getting user dictionary'
  //     )
  //     SpellingAPIManager.getDic(token, function (error, words) {
  //       if (error != null) {
  //         return next(OError.tag(error))
  //       }
  //       res.send(words)
  //     })
  //   },
}
