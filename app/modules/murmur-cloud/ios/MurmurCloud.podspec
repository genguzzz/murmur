Pod::Spec.new do |s|
  s.name           = 'MurmurCloud'
  s.version        = '1.0.0'
  s.summary        = 'Folder sync bridge for Murmur'
  s.description    = 'Remembers a user-picked folder (e.g. in iCloud Drive) across launches and reads/writes files in it.'
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
