# ===========================================================================
# eXe
# Copyright 2012, Pere Crespo Molina
#
# This program is free software; you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation; either version 2 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program; if not, write to the Free Software
# Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA  02111-1307  USA
# ===========================================================================
"""
Exports an eXe package as a Epub3 package
"""

import logging
import re
import datetime
import uuid
from cgi                           import escape
from zipfile                       import ZipFile, ZIP_DEFLATED, ZIP_STORED
from exe.webui                     import common
from exe.webui.blockfactory        import g_blockFactory
from exe.engine.error              import Error
from exe.engine.path               import Path, TempDirPath
from exe.engine.version            import release
from exe.export.pages              import Page, uniquifyNames
from exe                      	   import globals as G
from bs4                 import BeautifulSoup
from htmlentitydefs                import name2codepoint
from helper                        import exportMinFileJS, exportMinFileCSS
from exe.webui.common              import getFilesCSSToMinify, getFilesJSToMinify

log = logging.getLogger(__name__)

entitymap = name2codepoint.copy()
entitymap.pop('amp')
entitymap.pop('lt')
entitymap.pop('gt')
entitymap.pop('quot')


def htmlentitydecode(s):
    return re.sub('&(%s);' % '|'.join(entitymap),
                  lambda m: unichr(entitymap[m.group(1)]), s)


# ===========================================================================
class PublicationEpub3(object):
    """
    EPUB Publications 3.0, defines publication-level semantics and conformance requirements for EPUB 3,
    including the format of the Package Document and rules for how this document and other
    Publication Resources are associated to create a conforming EPUB Publication
    """

    def __init__(self, config, outputDir, package, pages, cover):
        """
        Initialize
        'outputDir' is the directory that we read the html from and also output
        the mainfest.xml
        """
        self.config = config
        self.outputDir = outputDir
        self.package = package
        self.pages = pages
        self.cover = cover
        self.specialResources = {'linked_resources': [], 'external': []}

        self._parseSpecialResources()

    def _parseSpecialResources(self):
        """
        Parse every page and search for special resources like:
            - Linked images
            - Iframes' sources
        """
        # We have to get the rendered view of all idevices across all pages
        for page in self.pages:
            for idevice in page.node.idevices:
                block = g_blockFactory.createBlock(None, idevice)
                div = block.renderView(self.package.style)

                # Find iframes
                src_list = re.findall(r'<iframe[^>]*\ssrc="(.*?)"', div);
                if src_list:
                    self.specialResources['external'].append(page.name)

                # Find links
                src_list = re.findall(r'<a[^>]*\shref="(.*?)"', div);
                if src_list:
                    for src in src_list:
                        # Only include it if is a internal link
                        if Path(self.outputDir/src).exists():
                            self.specialResources['linked_resources'].append(src)


    def save(self, filename):
        """
        Save a publication.opf file to self.outputDir
        """
        out = open(self.outputDir / filename, "w")
        out.write(self.createXML().encode("utf8"))
        out.close()

    def createXML(self):
        """
        returning XLM string for publication.opf file
        """
        xmlStr = u'<?xml version="1.0" encoding="UTF-8"?>\n'
        xmlStr += u'<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="pub-id">\n'

        xmlStr += self.createMetadata()
        xmlStr += self.createManifest()
        xmlStr += self.createSpine()

        xmlStr += u'</package>'
        return xmlStr

    def createManifest(self):
        import mimetypes

        xmlStr = u'<manifest>\n'

        xmlStr += u'<item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml" />\n'
        xmlStr += u'<item id="fallback" href="fallback.xhtml" media-type="application/xhtml+xml" />\n'

        for epubFile in self.outputDir.walk():
            if epubFile.basename() in ['package.opf', 'nav.xhtml', 'fallback.xhtml']:
                continue

            ext = epubFile.ext
            name = self.generate_item_id(epubFile.basename())

            mimetype, _ = mimetypes.guess_type(epubFile.abspath())
            if not mimetype:
                if ext and ext == 'webm':
                    mimetype = u'video/webm'
                else:
                    mimetype = u'application/octet-stream'

            property_list = []

            if ext == '.xhtml':
                if epubFile.namebase != 'cover':
                    property_list.append(u'scripted')
                name = epubFile.namebase
                # We need to ensure that XHTML files have the correct mime type
                if mimetype == u'application/octet-stream':
                    mimetype = u'application/xhtml+xml'

            if epubFile.basename() == self.cover:
                property_list.append(u'cover-image')

            if name in self.specialResources['external']:
                property_list.append(u'remote-resources')

            properties = u''
            if len(property_list) > 0:
                properties = u' properties="' + u' '.join(property_list) + u'"'

            # According to the spec, every resource referenced in the spine and is not an EPUB Content Document
            # must have a fallback element. In this case we have a general "fallback.xhtml" file.
            # We add it to all resources as we still don't know which of them will be added to the spine (if any).
            # http://www.idpf.org/epub/30/spec/epub30-publications.html#sec-fallback-processing-flow
            fallback = '';
            if mimetype not in ['application/xhtml+xml', 'image/svg+xml']:
                fallback = u' fallback="fallback"'

            xmlStr += u'<item id="%s" href="%s" media-type="%s"%s%s />\n' % (name,
                                                                       self.outputDir.relpathto(epubFile),
                                                                       mimetype,
                                                                       properties,
                                                                       fallback)

        xmlStr += u"</manifest>\n"

        return xmlStr

    def createMetadata(self):
        lrm = self.package.dublinCore.__dict__.copy()
        xml = u'<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n'
        for key, value in lrm.items():
            pub_id = ''
            if key == 'identifier':
                pub_id = ' id="pub-id"'
                if not value:
                    self.package.dublinCore.identifier = value = str(uuid.uuid4())
            if value:
                xml += u'<dc:%s%s>%s</dc:%s>\n' % (key, pub_id, escape(value), key)
        # Add title (required property)
        # http://www.idpf.org/epub/30/spec/epub30-publications.html#sec-metadata-elem
        xml += u'<dc:title>%s</dc:title>\n' % self.package.title
        xml += u'<meta property="dcterms:modified">%s</meta>\n' % datetime.datetime.now().strftime('%Y-%m-%dT%H:%M:%SZ')
        xml += u'</metadata>\n'
        return xml

    def createSpine(self):
        """
        Returning xml string for items and resources
        """
        xml_str = u'<spine>\n'
        xml_str += u'<itemref idref="cover"/>\n'
        for page in self.pages:
            if page.name == 'cover':
                continue
            xml_str += self.genItemResStr(page)

        # We need to add an itemref tag for each linked element included in the package (images, external HTMLs...)
        for linked_resource in self.specialResources['linked_resources']:
            name = self.generate_item_id(linked_resource)
            xml_str += u'<itemref idref="%s" />\n' % name

        xml_str += u'</spine>\n'
        return xml_str

    def genItemResStr(self, page):
        """
        Generate itemref tags for the page and any linked files
        """
        return u'<itemref idref="%s" />\n' % page.name.replace('.', '-')

    def generate_item_id(self, item_name):
        """
        Generate id and idref from package.orf
        """
        name = item_name.translate({ord(u'.'): u'_', ord(u'('): u'', ord(u')'): u''})
        if name[0] in [unicode(i) for i in range(0, 10)]:
            name = u'_' + name
        return name
# ===========================================================================


class ContainerEpub3(object):
    """
    Represents an META-INF/container.xml file .Read EPUB Open Container Format (OCF) 3.0
    """

    def __init__(self, outputDir):
        """
        Initialize
        'outputDir' is the directory that we read the html from and also output
        the mainfest.xml
        """

        self.outputDir = outputDir

    def save(self, filename):
        """
        Save a container.xml file to self.outputDir
        """
        out = open(self.outputDir / filename, "w")
        out.write(self.createXML().encode('utf8'))
        out.close()

    def createXML(self):
        """
        returning XLM string for META-INF/container.xml file
        """

        xmlStr = u"""<?xml version="1.0"?>
            <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
                <rootfiles>
                    <rootfile full-path="EPUB/package.opf"
                        media-type="application/oebps-package+xml" />
                </rootfiles>
            </container>
        """
        return xmlStr


class NavEpub3(object):
    def __init__(self, pages, outputDir):
        self.pages = pages
        self.outputDir = outputDir

    def save(self):
        out = open(self.outputDir / 'nav.xhtml', "w")
        out.write(self.createXML())
        out.close()

    def createXML(self):
        xmlStr = u"""<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en"
    xmlns:epub="http://www.idpf.org/2007/ops">
    <head>
        <meta charset="utf-8"></meta>
    </head>
    <body>
        <nav epub:type="toc" id="toc">"""

        currentDepth = 1
        for page in self.pages[1:]:
            if page.depth > currentDepth:
                xmlStr += u'<ol>\n'
                currentDepth = page.depth
            else:
                xmlStr += u'</li>\n'
            while currentDepth > page.depth:
                xmlStr += u'</ol>\n</li>\n'
                currentDepth -= 1
            xmlStr += u"<li><a href=\"%s\">%s</a>\n" % (page.name + ".xhtml", escape(page.node.title))

        while currentDepth > 1:
            xmlStr += u'</li>\n</ol>\n'
            currentDepth -= 1

        xmlStr += u"""      </nav>
    </body>
</html>"""

        return xmlStr


class Epub3Page(Page):
    """
    This class transforms an eXe node into a SCO
    """
    def __init__(self, name, depth, node):
        super(Epub3Page, self).__init__(name, depth, node)

    def save(self, outputDirPage, pages):
        """
        This is the main function.  It will render the page and save it to a
        file.
        'outputDirPage' is the name of the directory where the node will be saved to,
        the filename will be the 'self.node.id'.html or 'index.html' if
        self.node is the root node. 'outputDirPage' must be a 'Path' instance
        """
        out = open(outputDirPage / self.name + ".xhtml", "wb")
        out.write(self.render(pages))
        out.close()

    def render(self, pages):
        """
        Returns an XHTML string rendering this page.
        """
        old_dT = common.getExportDocType()
        common.setExportDocType('HTML5')
        dT = common.getExportDocType()
        lb = "\n"  # Line breaks
        sectionTag = "div"
        articleTag = "div"
        headerTag = "div"
        if dT == "HTML5":
            sectionTag = "section"
            articleTag = "article"
            headerTag = "header"
        html = common.docType()
        lenguaje = G.application.config.locale
        if self.node.package.lang != "":
            lenguaje = self.node.package.lang
        html += u"<html lang=\"" + lenguaje + "\" xml:lang=\"" + lenguaje + "\" xmlns=\"http://www.w3.org/1999/xhtml\">" + lb
        html += u"<head>" + lb
        html += u"<title>"
        if self.node.id == '0':
            if self.node.package.title != '':
                html += escape(self.node.package.title)
            else:
                html += escape(self.node.titleLong)
        else:
            if self.node.package.title != '':
                html += escape(self.node.titleLong) + " | " + escape(self.node.package.title)
            else:
                html += escape(self.node.titleLong)
        html += u" </title>" + lb
        html += u'<meta charset="utf-8" />' + lb
        if dT != "HTML5" and self.node.package.lang != "":
            html += '<meta http-equiv="content-language" content="' + lenguaje + '" />' + lb
        if self.node.package.author != "":
            html += '<meta name="author" content="' + escape(self.node.package.author, True) + '" />' + lb
        html += common.getLicenseMetadata(self.node.package.license)
        html += '<meta name="generator" content="eXeLearning ' + release + ' - exelearning.net" />' + lb
        if self.node.id == '0':
            if self.node.package.description != "":
                html += '<meta name="description" content="' + escape(self.node.package.description, True) + '" />' + lb
        html += u"<link rel=\"stylesheet\" type=\"text/css\" href=\"base.css\" />" + lb
        if common.hasWikipediaIdevice(self.node):
            html += u"<link rel=\"stylesheet\" type=\"text/css\" href=\"exe_wikipedia.css\" />" + lb
        if common.hasGalleryIdevice(self.node):
            html += u"<link rel=\"stylesheet\" type=\"text/css\" href=\"exe_lightbox.css\" />" + lb
        if common.hasFX(self.node):
            html += u"<link rel=\"stylesheet\" type=\"text/css\" href=\"exe_effects.css\" />" + lb
        if common.hasSH(self.node):
            html += u"<link rel=\"stylesheet\" type=\"text/css\" href=\"exe_highlighter.css\" />" + lb
        if common.hasGames(self.node):
            html += u"<link rel=\"stylesheet\" type=\"text/css\" href=\"exe_games.css\" />" + lb
        if common.hasABCMusic(self.node):
            html += u"<link rel=\"stylesheet\" type=\"text/css\" href=\"exe_abcmusic.css\" />" + lb
        html += u"<link rel=\"stylesheet\" type=\"text/css\" href=\"content.css\" />" + lb
        if dT == "HTML5" or common.nodeHasMediaelement(self.node):
            html += u'<!--[if lt IE 9]><script type="text/javascript" src="exe_html5.js"></script><![endif]-->' + lb
        style = G.application.config.styleStore.getStyle(self.node.package.style)

        # jQuery
        if style.hasValidConfig:
            if style.get_jquery() == True:
                html += u'<script type="text/javascript" src="exe_jquery.js"></script>' + lb
            else:
                html += u'<script type="text/javascript" src="' + style.get_jquery() + '"></script>' + lb
        else:
            html += u'<script type="text/javascript" src="exe_jquery.js"></script>' + lb

        if common.hasGalleryIdevice(self.node):
            html += u'<script type="text/javascript" src="exe_lightbox.js"></script>' + lb
        if common.hasFX(self.node):
            html += u'<script type="text/javascript" src="exe_effects.js"></script>' + lb
        if common.hasSH(self.node):
            html += u'<script type="text/javascript" src="exe_highlighter.js"></script>' + lb
        html += u'<script type="text/javascript" src="common_i18n.js"></script>' + lb
        if common.hasGames(self.node):
            html += u'<script type="text/javascript" src="exe_games.js"></script>' + lb
        if common.hasABCMusic(self.node):
            html += u'<script type="text/javascript" src="exe_abcmusic.js"></script>' + lb
        html += u'<script type="text/javascript" src="common.js"></script>' + lb

        html += common.printJavaScriptIdevicesScripts('export', self)

        if common.hasMagnifier(self.node):
            html += u'<script type="text/javascript" src="mojomagnify.js"></script>' + lb
        # Some styles might have their own JavaScript files (see their config.xml file)
        if style.hasValidConfig:
            html += style.get_extra_head()
        html += common.getExtraHeadContent(self.node.package)
        html += u"</head>" + lb
        html += u'<body class="exe-epub3" id="exe-node-'+self.node.id+'">' + lb
        html += u"<div id=\"outer\">" + lb
        html += u"<" + sectionTag + " id=\"main\">" + lb
        html += u"<" + headerTag + " id=\"nodeDecoration\">"
        html += u"<div id=\"headerContent\">"
        html += u'<h1 id=\"nodeTitle\">'
        html += escape(self.node.titleLong)
        html += u'</h1>'
        html += u'</div>'
        html += u"</" + headerTag + ">" + lb

        self.node.exportType = 'epub'

        for idevice in self.node.idevices:
            if idevice.klass != 'NotaIdevice':
                e = " em_iDevice"
                if unicode(idevice.emphasis) == '0':
                    e = ""
                html += u'<' + articleTag + ' class="iDevice_wrapper %s%s" id="id%s">%s' % (idevice.klass, e, idevice.id, lb)
                block = g_blockFactory.createBlock(None, idevice)
                if not block:
                    log.critical("Unable to render iDevice.")
                    raise Error("Unable to render iDevice.")
                if hasattr(idevice, "isQuiz"):
                    html += htmlentitydecode(block.renderJavascriptForWeb())
                if idevice.title != "Forum Discussion":
                    html += htmlentitydecode(self.processInternalLinks(
                        block.renderView(self.node.package.style)))
                html += u'</' + articleTag + '>' + lb  # iDevice div

            html = re.sub("(<iframe[^>]*)(src=\"//)", "\g<1>src=\"https://", html)

        html += u"</" + sectionTag + ">" + lb  # /#main

        if self.node.package.get_addPagination():
            html += "<p class='pagination page-counter'>" + c_('Page %s of %s') % ('<strong>'+str(pages.index(self))+'</strong>','<strong>'+str((len(pages) -1))+'</strong>')+ "</p>"+lb

        printPageFooter = False
        if pages.index(self)==1 or len(pages)-1==pages.index(self):
            printPageFooter = True # First and last pages
        if printPageFooter:
            html += self.renderLicense()
            html += unicode(BeautifulSoup(self.renderFooter()))
        html += u"</div>" + lb  # /#outer
        if style.hasValidConfig:
            html += style.get_extra_body()
        html += u'</body></html>'
        html = html.encode('utf8')
        # JR: Eliminamos los atributos de las ecuaciones
        aux = re.compile("exe_math_latex=\"[^\"]*\"")
        html = aux.sub("", html)
        aux = re.compile("exe_math_size=\"[^\"]*\"")
        html = aux.sub("", html)
        # JR: Cambio el & en los enlaces del glosario
        html = html.replace("&concept", "&amp;concept")
        # Remove "resources/" from data="resources/ and the url param
        html = html.replace("video/quicktime\" data=\"resources/", "video/quicktime\" data=\"")
        html = html.replace("application/x-mplayer2\" data=\"resources/", "application/x-mplayer2\" data=\"")
        html = html.replace("audio/x-pn-realaudio-plugin\" data=\"resources/", "audio/x-pn-realaudio-plugin\" data=\"")
        html = html.replace("<param name=\"url\" value=\"resources/", "<param name=\"url\" value=\"")

        common.setExportDocType(old_dT)
        return html

    def processInternalLinks(self, html):
        """
        take care of any internal links which are in the form of:
           href="exe-node:Home:Topic:etc#Anchor"
        For this export, go ahead and remove the link entirely,
        leaving only its text, since such links are not to be in the LMS.
        The links to the elp file will not be removed.
        """
        html = common.enableLinksToElp(self.node.package, html)
        return common.removeInternalLinks(html)


class Epub3Cover(Epub3Page):
    def render(self, pages):
        html = '''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
   <head>
      <meta charset="utf-8" />
   </head>
   <body style="text-align: center;">
      <img id="img-cover" src="%s" alt="%s" />
   </body>
</html>'''
        src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs%3D'
        for idevice in self.node.idevices:
            block = g_blockFactory.createBlock(None, idevice)
            div = block.renderView(self.node.package.style)
            srcs = re.findall(r'<img[^>]*\ssrc="(.*?)"', div)
            if srcs:
                src = srcs[0]
                self.cover = src
                break
        return html % (src, escape(self.node.package.title, True))


class Epub3Export(object):
    """
    Exports an eXe package as a epub 3 package
    The 'Hello World' of a epub 3 publication might contain files:
        mimetype
        META-INF/container.xml
        Content/HelloWorld.opf
        Content/HelloWorld.xhtml
    """
    def __init__(self, config, styleDir, filename):
        """
        Initialize
        'styleDir' is the directory from which we will copy our style sheets
        (and some gifs)
        """
        self.config = config
        self.imagesDir = config.webDir / "images"
        self.scriptsDir = config.webDir / "scripts"
        self.cssDir = config.webDir / "css"
        self.templatesDir = config.webDir / "templates"
        self.schemasDir = config.webDir / "schemas/ims"
        self.styleDir = Path(styleDir)
        self.filename = Path(filename)
        self.pages = []

    def export(self, package):
        """
        Export epub 3 package
        """
        # First do the export to a temporary directory
        outputDir = TempDirPath()

        '''
        fileDir = outputDir/"META-INF"
        fileDir.mkdir()
        fileDir = outputDir/"Content"
        fileDir.mkdir()
        '''

        metainfPages = Path(outputDir.abspath() + '/META-INF')
        # metainfPages = outputDir/'META-INF'
        metainfPages.mkdir()
        contentPages = Path(outputDir.abspath() + '/EPUB')
        # contentPages = outputDir/'Content'
        contentPages.mkdir()
        # print contentPages.abspath()
        # print outputDir.abspath()

        # Export the package content
        self.pages = [Epub3Cover("cover", 1, package.root)]

        self.generatePages(package.root, 2)
        uniquifyNames(self.pages)

        cover = None
        for page in self.pages:
            page.save(contentPages, self.pages)
            if hasattr(page, 'cover'):
                cover = page.cover

        # Create mimetype file
        mimetypeFile = open(outputDir.abspath() + '/mimetype', "w")
        mimetypeFile.write('application/epub+zip')
        mimetypeFile.close()

        # Create common_i18n file
        langFile = open(contentPages + '/common_i18n.js', "w")
        langFile.write(common.getJavaScriptStrings(False))
        langFile.close()

        # Copy the style files to the output dir
        # But not nav.css
        styleFiles = [self.styleDir /'..'/ 'popup_bg.gif']
        styleFiles += [f for f in self.styleDir.files("*.*") if f.basename() not in ['nav.css']]

        # FIXME for now, only copy files referenced in Common Cartridge
        # this really should apply to all exports, but without a manifest
        # of the files needed by an included stylesheet it is too restrictive

        # Add fallback document for possible image links
        if Path(self.styleDir/'fallback.xhtml').exists():
            styleFiles += [self.styleDir /'fallback.xhtml']
        else:
            styleFiles += [self.styleDir/'..'/'fallback.xhtml']

        # copy the package's resource files
        for resourceFile in package.resourceDir.walkfiles():
            fn = package.resourceDir.relpathto(resourceFile)

            if ("/" in fn):
                Dir = Path(contentPages/fn[:fn.rindex("/")])
                if not Dir.exists():
                    Dir.makedirs()

                resourceFile.copy(contentPages/Dir)
            else:
                resourceFile.copy(contentPages)

        self.styleDir.copylist(styleFiles, contentPages)

        # copy players for media idevices.
        hasFlowplayer = False
        hasMagnifier = False
        hasXspfplayer = False
        hasGallery = False
        hasFX = False
        hasSH = False
        hasGames = False
        hasElpLink = False
        hasWikipedia = False
        isBreak = False
        hasInstructions = False
        hasTooltips = False
        hasABCMusic = False

        for page in self.pages:
            if isBreak:
                break
            for idevice in page.node.idevices:
                if (hasFlowplayer and hasMagnifier and hasXspfplayer and hasGallery and hasFX and hasSH and hasGames and hasElpLink and hasWikipedia and hasInstructions and hasTooltips and hasABCMusic):
                    isBreak = True
                    break
                if not hasFlowplayer:
                    if 'flowPlayer.swf' in idevice.systemResources:
                        hasFlowplayer = True
                if not hasMagnifier:
                    if 'mojomagnify.js' in idevice.systemResources:
                        hasMagnifier = True
                if not hasXspfplayer:
                    if 'xspf_player.swf' in idevice.systemResources:
                        hasXspfplayer = True
                if not hasGallery:
                    hasGallery = common.ideviceHasGallery(idevice)
                if not hasFX:
                    hasFX = common.ideviceHasFX(idevice)
                if not hasSH:
                    hasSH = common.ideviceHasSH(idevice)
                if not hasGames:
                    hasGames = common.ideviceHasGames(idevice)
                if not hasElpLink:
                    hasElpLink = common.ideviceHasElpLink(idevice,package)
                if not hasWikipedia:
                    if 'WikipediaIdevice' == idevice.klass:
                        hasWikipedia = True
                if not hasInstructions:
                    if 'TrueFalseIdevice' == idevice.klass or 'MultichoiceIdevice' == idevice.klass or 'VerdaderofalsofpdIdevice' == idevice.klass or 'EleccionmultiplefpdIdevice' == idevice.klass:
                        hasInstructions = True
                if not hasTooltips:
                    hasTooltips = common.ideviceHasTooltips(idevice)
                if not hasABCMusic:
                    hasABCMusic = common.ideviceHasABCMusic(idevice)

            common.exportJavaScriptIdevicesFiles(page.node.idevices, contentPages);

        if hasFlowplayer:
            videofile = (self.templatesDir / 'flowPlayer.swf')
            videofile.copyfile(contentPages / 'flowPlayer.swf')
            controlsfile = (self.templatesDir / 'flowplayer.controls.swf')
            controlsfile.copyfile(contentPages / 'flowplayer.controls.swf')
        if hasMagnifier:
            videofile = (self.templatesDir / 'mojomagnify.js')
            videofile.copyfile(contentPages / 'mojomagnify.js')
        if hasXspfplayer:
            videofile = (self.templatesDir / 'xspf_player.swf')
            videofile.copyfile(contentPages / 'xspf_player.swf')
        if hasGallery:
            exeLightbox = (self.scriptsDir / 'exe_lightbox')
            exeLightbox.copyfiles(contentPages)
        if hasFX:
            exeEffects = (self.scriptsDir / 'exe_effects')
            exeEffects.copyfiles(contentPages)
        if hasSH:
            exeSH = (self.scriptsDir / 'exe_highlighter')
            exeSH.copyfiles(contentPages)
        if hasGames:
            exeGames = (self.scriptsDir / 'exe_games')
            exeGames.copyfiles(contentPages)
            # Add game js string to common_i18n
            langGameFile = open(contentPages + '/common_i18n.js', "a")
            langGameFile.write(common.getGamesJavaScriptStrings(False))
            langGameFile.close()
        if hasElpLink or package.get_exportElp():
            # Export the elp file
            currentPackagePath = Path(package.filename)
            currentPackagePath.copyfile(contentPages/package.name+'.elp')
        if hasWikipedia:
            wikipediaCSS = (self.cssDir / 'exe_wikipedia.css')
            wikipediaCSS.copyfile(contentPages / 'exe_wikipedia.css')
        if hasInstructions:
            common.copyFileIfNotInStyle('panel-amusements.png', self, contentPages)
            common.copyFileIfNotInStyle('stock-stop.png', self, contentPages)
        if hasTooltips:
            exe_tooltips = (self.scriptsDir / 'exe_tooltips')
            exe_tooltips.copyfiles(contentPages)
        if hasABCMusic:
            pluginScripts = (self.scriptsDir/'tinymce_4/js/tinymce/plugins/abcmusic/export')
            pluginScripts.copyfiles(contentPages)

        my_style = G.application.config.styleStore.getStyle(package.style)
        if my_style.hasValidConfig:
            if my_style.get_jquery() == True:
                jsFile = (self.scriptsDir / 'exe_jquery.js')
                jsFile.copyfile(contentPages / 'exe_jquery.js')
        else:
            jsFile = (self.scriptsDir / 'exe_jquery.js')
            jsFile.copyfile(contentPages / 'exe_jquery.js')


        # Copy and minify CSS files
        css_files = getFilesCSSToMinify('epub3', self.styleDir)
        exportMinFileCSS(css_files, contentPages)

        # Copy and minify JS files
        js_files = getFilesJSToMinify('epub3', self.scriptsDir)
        exportMinFileJS(js_files, contentPages)

#         if hasattr(package, 'exportSource') and package.exportSource:
#             (G.application.config.webDir / 'templates' / 'content.xsd').copyfile(outputDir / 'content.xsd')
#             (outputDir / 'content.data').write_bytes(encodeObject(package))
#             (outputDir / 'contentv3.xml').write_bytes(encodeObjectToXML(package))

        if package.license == "license GFDL":
            # include a copy of the GNU Free Documentation Licence
            (self.templatesDir / 'fdl.html').copyfile(contentPages / 'fdl.html')

        # Create the nav.xhtml file
        container = NavEpub3(self.pages, contentPages)
        container.save()

        # Create the publication file
        publication = PublicationEpub3(self.config, contentPages, package, self.pages, cover)
        publication.save("package.opf")

        # Create the container file
        container = ContainerEpub3(metainfPages)
        container.save("container.xml")

        # Zip it up!
        self.filename.safeSave(self.doZip, _(u'EXPORT FAILED!\nLast succesful export is %s.'), outputDir)
        # Clean up the temporary dir

        outputDir.rmtree()

    def doZip(self, fileObj, outputDir):
        """
        Actually does the zipping of the file. Called by 'Path.safeSave'
        """
        zipped = ZipFile(fileObj, "w")

        mimetype = outputDir / "mimetype"
        zipped.write(mimetype, "mimetype", ZIP_STORED)

        for epubFile in outputDir.walkfiles():
            if epubFile.basename() == 'mimetype':
                continue
            relativePath = epubFile.basename()
            parentdir = epubFile.splitpath()[0]
            while (outputDir.basename() != parentdir.basename()):
                relativePath = parentdir.basename() / relativePath
                parentdir = parentdir.splitpath()[0]

            zipped.write(epubFile,
                             relativePath.encode('utf8'),
                             compress_type=ZIP_DEFLATED)
        zipped.close()

    def generatePages(self, node, depth):
        """
        Recursive function for exporting a node.
        'node' is the node that we are making a page for
        'depth' is the number of ancestors that the page has +1 (ie. root is 1)
        """
        pageName = node.titleShort.lower().replace(" ", u"_")
        pageName = re.sub(r"\W", "", pageName)
        if not pageName:
            pageName = u"__"

        if pageName[0] in [unicode(i) for i in range(0, 10)]:
            pageName = u'_' + pageName

        page = Epub3Page(pageName, depth, node)

        self.pages.append(page)
        for child in node.children:
            self.generatePages(child, depth + 1)
