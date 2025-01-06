# DragonRuby Autocomplete

Visual Studio extension to streamline DragonRuby Development.


## Installation  

Grab the .vsix from the latest release.

[Packaged Releases](https://github.com/DSchaedler/dragonrubyautocomplete/releases)

## Features  

* [Outputs](https://docs.dragonruby.org/#/api/outputs)
* [Inputs](https://docs.dragonruby.org/#/api/inputs)
* [Runtime](https://docs.dragonruby.org/#/api/runtime)  
* [Geometry](https://docs.dragonruby.org/#/api/geometry)  

## Contributing

This extension was creatied using the following tutorial: https://code.visualstudio.com/api/get-started/your-first-extension. The dependencies are not required to contribute to the project, but are highly recommended.

1. Install [Visual Stuido Code](https://code.visualstudio.com/)  
2. Install [nodejs](https://nodejs.org/)
3. Install [git](https://git-scm.com/)
4. Install Yeoman and the Visual Studio Code Generator  
   a. `npm install --global yo generator-code`  
5. Install Visual Studio Code Extensions vsce Manager  
   a. `npm install -g @vscode/vsce`  
7. Clone this repository as a project  

Please do not contribute any unlicensed code or full samples to this project.

Useful Links:  
[Testing Extensions](https://code.visualstudio.com/api/working-with-extensions/testing-extension)  
[Creting Snippets](https://code.visualstudio.com/docs/editor/userdefinedsnippets#_creating-your-own-snippets)  

## Release Notes  

* [v0.0.9-dev] Finish Geometry Methods. Fix typos in Outputs.
* [v0.0.8-dev] Fix a very annoying bug with the http respond method.
* [v0.0.7-dev] Add GTK methods.
* [v0.0.6-dev] Add keyboard inputs. Improve whitespace. Fix typo in controller input.
* [v0.0.5-dev] Consolidate mouse inputs. Finish controller and copy through controller four.
* [v0.0.4-dev] Add Mouse, Touch, some controller inputs. Improve namespacing. Fix wildcards.
* [v0.0.3-dev] Rebuilt the thing to work. Added a bunch more snippets.
* [v0.0.2-dev] Snippets for Sounds. Link to Documentation.
* [v0.0.1-dev] Inital Commit  

# License and Copyright  

DragonRuby Autocomplete - Autocomplete snippets and utilities to streamline DragonRuby Development  
Copyright (C) 2025 Dee Schaedler  
  
This program is free software: you can redistribute it and/or modify  
it under the terms of the GNU General Public License as published by  
the Free Software Foundation, either version 3 of the License, or  
(at your option) any later version.  

This program is distributed in the hope that it will be useful,  
but WITHOUT ANY WARRANTY; without even the implied warranty of  
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the  
GNU General Public License for more details.  

You should have received a copy of the GNU General Public License  
along with this program.  If not, see <https://www.gnu.org/licenses/>.  

## License Scope & Relevance  

TLDR: Don't rip me off. You may distribute the program and source code (including the required copyright and license statements), and you may treat the program and it's source code as a library (as defined by the GNU Lesser General Public License). However, the software is licensed under GPLv3 because it does not meet the technical definition of a library as defined under the LGPL. Please contact me for licensing if you are creating a commercial, for profit work which is not allowed under GPLv3.

Because most of The Program is just data and repackaged documentation, it can be difficult to determine what, if anything, falls under the stated copyright and license. Additionally, the .json file format does not natively allow comments for the inclusion of a copyright disclaimer where it is appropriate.  

Under the definitions of the GNU GPLv3, the covered work includes The Program, the Source Code, and the Object Code included in this repository.  

The covered work includes, but is not limited to:
 * The Program itself, the compiled version, and Object Code, in any form in which it they may be distributed.  
 * The specific collection, arrangement, interpretation, and creative choices involved in the creation of The Program.  
 * Source Code created by the author for the purpose of the covered work. Source Code in the covered work derived from other works by the same author is assumed to be appropriately licensed, or re-licensed under the new license agreement.  
 * The name "DragonRuby Autocomplete".  

This does not include:
 * Configuration files, settings, System Libraries, Corresponding Source or other work which is included because it is necessary for compilation, but was not created by the author.  
 * Source Code from other authors, which will will be licensed and noted when appropriate.  

## What gives you the right to reproduce the DragonRuby Documentation?

Most Importantly, Amir Rajan (Creator of DragonRuby) knows what I'm doing and could ask me to take this down at any time. I am a moderator in the DragonRuby official Discord and have contributed heavily to the community.

Secondly, the portion of the docs that is reproduced is the section referred to as the API. The documentation page has no license listed, and the dragonruby.org Terms of Service only specify that you many not use the service to violate any laws (including copyright laws). Purchasing and downloading the engine itself also offers no further license agreement.

Under Supreme Court ruling No. 18–956. (Argued October 7, 2020—Decided April 5, 2021) the United States Supreme Court held that
> Google’s copying of the Java SE API, which included only those  
> lines of code that were needed to allow programmers to put their  
> accrued talents to work in a new and transformative program, was a fair  
> use of that material as a matter of law. Pp. 11–36.

Very little is reproduced outside of the API potion, and no other copyrighted material like samples, guides, images, etc. are used. I would argue that this work transforms the API documentation in a way which allows programmers to use their accrued talents in a new way. However, fair use law is gross. Amir, please don't sue me.
