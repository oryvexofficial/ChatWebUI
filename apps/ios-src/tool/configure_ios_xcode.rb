#!/usr/bin/env ruby
# Wires OryvexTunnelExtension, entitlements, bridging headers, and XCFrameworks into Runner.xcodeproj.
require 'xcodeproj'

project_path = File.expand_path('../ios/Runner.xcodeproj', __dir__)
project = Xcodeproj::Project.open(project_path)

runner = project.targets.find { |t| t.name == 'Runner' }
raise 'Runner target not found' unless runner

# 1. Configure Runner target settings (iPhone + iPad Universal, iOS 15.0, entitlements, bridging header)
runner.build_configurations.each do |cfg|
  cfg.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.0'
  cfg.build_settings['TARGETED_DEVICE_FAMILY'] = '1,2'
  cfg.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.oryvex.oryvexcore'
  cfg.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'Runner/Runner.entitlements'
  cfg.build_settings['SWIFT_OBJC_BRIDGING_HEADER'] = 'Runner/Runner-Bridging-Header.h'
  cfg.build_settings['FRAMEWORK_SEARCH_PATHS'] = ['$(inherited)', '$(PROJECT_DIR)/Frameworks']
end

runner_group = project.main_group.find_subpath('Runner', true)
%w[CoreBridge.swift FoxBridge.swift].each do |fname|
  next if runner_group.files.any? { |f| f.path == fname }
  ref = runner_group.new_file(fname)
  runner.source_build_phase.add_file_reference(ref)
end

# 2. Ensure OryvexTunnelExtension Network Extension target exists
ext_name = 'OryvexTunnelExtension'
ext = project.targets.find { |t| t.name == ext_name }
unless ext
  ext = project.new_target(:app_extension, ext_name, :ios, '15.0')
  ext.product_reference.path = "#{ext_name}.appex"
  ext_group = project.main_group.new_group(ext_name, ext_name)
  swift_ref = ext_group.new_file('PacketTunnelProvider.swift')
  ext_group.new_file('Info.plist')
  ext_group.new_file('OryvexTunnelExtension.entitlements')
  ext.source_build_phase.add_file_reference(swift_ref)

  ext.build_configurations.each do |cfg|
    cfg.build_settings['PRODUCT_NAME'] = '$(TARGET_NAME)'
    cfg.build_settings['WRAPPER_EXTENSION'] = 'appex'
    cfg.build_settings['GENERATE_INFOPLIST_FILE'] = 'NO'
    cfg.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.0'
    cfg.build_settings['TARGETED_DEVICE_FAMILY'] = '1,2'
    cfg.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.oryvex.oryvexcore.OryvexTunnelExtension'
    cfg.build_settings['INFOPLIST_FILE'] = 'OryvexTunnelExtension/Info.plist'
    cfg.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'OryvexTunnelExtension/OryvexTunnelExtension.entitlements'
    cfg.build_settings['SWIFT_OBJC_BRIDGING_HEADER'] = 'OryvexTunnelExtension/OryvexTunnelExtension-Bridging-Header.h'
    cfg.build_settings['FRAMEWORK_SEARCH_PATHS'] = ['$(inherited)', '$(PROJECT_DIR)/Frameworks']
    cfg.build_settings['SWIFT_VERSION'] = '5.0'
    cfg.build_settings['SKIP_INSTALL'] = 'YES'
  end

  # Embed extension in Runner
  runner.add_dependency(ext)
  embed_phase = runner.new_copy_files_build_phase('Embed App Extensions')
  embed_phase.dst_subfolder_spec = '13' # PlugIns
  embed_phase.add_file_reference(ext.product_reference)
end

# 3. Link available XCFrameworks from ios/Frameworks/
fw_dir = File.expand_path('../ios/Frameworks', __dir__)
fw_group = project.main_group.find_subpath('Frameworks', true)
%w[OryvexCore.xcframework FoxCore.xcframework HevSocks5Tunnel.xcframework].each do |fw|
  full = File.join(fw_dir, fw)
  next unless Dir.exist?(full)
  ref = fw_group.files.find { |f| f.path == "Frameworks/#{fw}" } || fw_group.new_file("Frameworks/#{fw}")
  runner.frameworks_build_phase.add_file_reference(ref) unless runner.frameworks_build_phase.files_references.include?(ref)
  ext.frameworks_build_phase.add_file_reference(ref) unless ext.frameworks_build_phase.files_references.include?(ref)
end

project.save
puts 'Configured Runner.xcodeproj with OryvexTunnelExtension and XCFrameworks.'
