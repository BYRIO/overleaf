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
    const { docUrls } = req.body || {}
    if (!Array.isArray(docUrls) || docUrls.length === 0) {
      return res.status(422).send({ error: 'docUrls required' })
    }

    async.parallel(
      docUrls.map(docUrl => cb => {
        request.get(docUrl, (err, response, body) => {
          // normalize callback shape for async.parallel
          cb(err, { response, body })
        })
      }),
      function (err, results) {
        if (err) {
          logger.error({ err }, 'failed to fetch bib files')
          return res.send({ keys: [] })
        }
        const keys = []
        results.forEach(({ body }) => {
          if (!body) return
          try {
            const parsed = bibParse(body)
            keys.push(...Object.keys(parsed))
          } catch (error) {
            logger.error({ error }, 'failed to parse bib file, skipping')
          }
        })
        logger.info({ keys }, 'all keys')
        res.send({ keys })
      }
    )
  }
}
