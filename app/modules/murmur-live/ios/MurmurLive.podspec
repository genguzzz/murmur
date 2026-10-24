Pod::Spec.new do |s|
  s.name           = 'MurmurLive'
  s.version        = '1.0.0'
  s.summary        = 'Live Activity (Dynamic Island) bridge for Murmur'
  s.description    = 'Starts, updates and ends the recording/playback Live Activity.'
  s.author         = 'Murmur'
  s.homepage       = 'https://github.com/genguzzz/murmur'
  s.license        = 'MIT'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: 'https://github.com/genguzzz/murmur.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,swift}'
end
