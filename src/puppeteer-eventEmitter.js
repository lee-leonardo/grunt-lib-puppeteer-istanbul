const EventEmitter = require('events');
const ipc = require('node-ipc');
/*
  Steps:
  1. setup the event emitter syntax (using node events rather than 3rd party) and harmonize it with puppeteer consumer
     - create two spawn calls, one for the producer, one for the consumer.
  2. ensure failures are being signaled correctly
  3. events:
      - log event, to log all the rudimentary logs
      - log the done handler to determine if test succeed or fail.
  4. publish and integrate into the two levels of plugins.
  5. Post work:
     - add verbose logging support for debugging.
     - add code to allow for scripting logging and other things.
     - move out puppeteer code into it's own repository.
     - create monitoring logic so that tests can be run in parallel
*/

/*
  TODO
   - to allow this to be concurrent this id needs to be unique (i.e. add the __filename to the id!)
   - pass the id's has in a connection request and have the monitor/semaphore to allow the scripts to only fire for requests with matching hashes.
*/

export default class PuppeteerEventListener extends EventEmitter {
  constructor(options) {
    super();

    ipc.config.id = 'puppeteerConsumer:' + options.url;
    ipc.config.retry = 1500;
    ipc.config.maxConnections = 1;

    this.url = options.url;
    this.grunt = grunt;
    this.options = options;
    this.resolve = resolveCallback;
  }

  spawn() {
    ipc.connectTo('producer', () => {
      ipc.of.producer.on('connect', () => {
        console.log('established connection with puppeteer-sock'.rainbow);
        ipc.of.producer.emit('test.page', {
          url: this.url
        });
      });

      //TODO need to setup emissions that pertain to logging into the console.
      //Error from qunit
      ipc.of.producer.on('qunit.log', res => {
        console.log(res.data);
      });

      //TODO emit debug

      //Error from qunit
      ipc.of.producer.on('qunit.error', res => {
        console.log(res.error);
      });

      ipc.of.producer.on('qunit.timeout', () => {
        //Handle Time Out
        this.emit('fail.timeout');
      });

      // Error from puppeteer or ipc
      ipc.of.producer.on('error', error => {
        if (this.options.verbose) {
          ipc.log('error: ', error);
        }

        this.emit('fail.load', this.url);
      });

      // Clean up connection to the producer.
      ipc.of.producer.on('done', res => {
        ipc.log("finised socket based operation".log);
        ipc.disconnect('producer');

        this.emit('done', res);
        this.resolve(res.successful);

        process.exit(0);
      });
      // This line will only happen if there is a issue on the producers end.
      ipc.of.producer.on('disconnect', () => {
        ipc.log("disconnected from connection with puppeteer-sock".notice);
      });
    });
  }

  cleanup() {
    if (this.options.startProducer) {
      this.child.kill();
    }
  }

  done(isSuccessful) {
    this.cleanup();
    this.resolve(isSuccessful);
  }
}
