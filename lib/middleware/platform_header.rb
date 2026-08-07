# frozen_string_literal: true

module Middleware # rubocop:disable Style/ClassAndModuleChildren
  class PlatformHeader
    def initialize(app)
      @app = app
    end

    def call(env)
      status, headers, response = @app.call(env)
      headers['X-Platform'] = 'automatizefy'
      [status, headers, response]
    end
  end
end
